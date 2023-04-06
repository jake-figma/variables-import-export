console.clear();

function createCollection(name) {
  const collection = figma.variables.createVariableCollection(name);
  const modeId = collection.modes[0].modeID;
  return { collection, modeId };
}

function createToken(collection, modeId, type, name, value) {
  const token = figma.variables.createVariable(name, collection.id, type);
  token.setValueForMode(modeId, value);
  return token;
}

function createVariable(collection, modeId, key, valueKey, tokens) {
  const token = tokens[valueKey];
  return createToken(collection, modeId, token.resolvedType, key, {
    type: "VARIABLE_ID",
    id: `${token.id}`,
  });
}

function importJSONFile({ fileName, body }) {
  const json = JSON.parse(body);
  const { collection, modeId } = createCollection(fileName);
  const aliases = {};
  const tokens = {};
  Object.entries(json).forEach(([key, object]) => {
    traverseToken({
      collection,
      modeId,
      type: json.$type,
      key,
      object,
      tokens,
      aliases,
    });
  });
  processAliases({ collection, modeId, aliases, tokens });
}

function processAliases({ collection, modeId, aliases, tokens }) {
  aliases = Object.values(aliases);
  let generations = aliases.length;
  while (aliases.length && generations > 0) {
    for (let i = 0; i < aliases.length; i++) {
      const { key, type, valueKey } = aliases[i];
      const token = tokens[valueKey];
      if (token) {
        aliases.splice(i, 1);
        tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
      }
    }
    generations--;
  }
}

function isAlias(value) {
  return value.toString().trim().charAt(0) === "{";
}

function traverseToken({
  collection,
  modeId,
  type,
  key,
  object,
  tokens,
  aliases,
}) {
  type = type || object.$type;
  // if key is a meta field, move on
  if (key.charAt(0) === "$") {
    return;
  }
  if (object.$value !== undefined) {
    if (isAlias(object.$value)) {
      const valueKey = object.$value
        .trim()
        .replace(/\./g, "/")
        .replace(/[\{\}]/g, "");
      if (tokens[valueKey]) {
        tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
      } else {
        aliases[key] = {
          key,
          type,
          valueKey,
        };
      }
    } else if (type === "color") {
      tokens[key] = createToken(
        collection,
        modeId,
        "COLOR",
        key,
        parseColor(object.$value)
      );
    } else if (type === "number") {
      tokens[key] = createToken(
        collection,
        modeId,
        "FLOAT",
        key,
        object.$value
      );
    } else {
      console.log("unsupported type", type, object);
    }
  } else {
    Object.entries(object).forEach(([key2, object2]) => {
      if (key2.charAt(0) !== "$") {
        traverseToken({
          collection,
          modeId,
          type,
          key: `${key}/${key2}`,
          object: object2,
          tokens,
          aliases,
        });
      }
    });
  }
}

function exportToJSON() {
  const collections = figma.variables.getLocalVariableCollections();
  const files = [];
  collections.forEach((collection) =>
    files.push(...processCollection(collection))
  );
  figma.ui.postMessage({ type: "EXPORT_RESULT", files });
}

function processCollection({ name, modes, variableIds }) {
  const files = [];
  modes.forEach((mode) => {
    const file = { fileName: `${name}.${mode.name}.tokens.json`, body: {} };
    variableIds.forEach((variableId) => {
      const { name, resolvedType, valuesByMode } =
        figma.variables.getVariableById(variableId);
      const value = valuesByMode[mode.modeID];
      if (value !== undefined && ["COLOR", "FLOAT"].includes(resolvedType)) {
        let obj = file.body;
        name.split("/").forEach((groupName) => {
          obj[groupName] = obj[groupName] || {};
          obj = obj[groupName];
        });
        obj.$type = resolvedType === "COLOR" ? "color" : "number";
        if (value.type === "VARIABLE_ID") {
          obj.$value = `{${figma.variables
            .getVariableById(value.id)
            .name.replace(/\//g, ".")}}`;
        } else {
          obj.$value = resolvedType === "COLOR" ? rgbToHex(value) : value;
        }
      }
    });
    files.push(file);
  });
  return files;
}

figma.ui.onmessage = (e) => {
  console.log("code received message", e);
  if (e.type === "IMPORT") {
    const { fileName, body } = e;
    importJSONFile({ fileName, body });
  } else if (e.type === "EXPORT") {
    exportToJSON();
  }
};
if (figma.command === "import") {
  figma.showUI(__uiFiles__["import"], {
    width: 500,
    height: 500,
    themeColors: true,
  });
} else if (figma.command === "export") {
  figma.showUI(__uiFiles__["export"], {
    width: 500,
    height: 500,
    themeColors: true,
  });
}

function exampleJSONAnnoyingVariance() {
  return {
    fileName: "Wild Examples",
    body: `{
    "color": {
      "grouptyped": {
        "$type": "color",
        "brown": { "$value": "#a2845e" },
        "danger-deep": { "$value": "{color.valuetyped.danger}" }
      },
      "valuetyped": {
        "red": {
          "$value": "{color.deep.deep.deep.deep.deep}"
        },
        "danger": { "$value": "{color.valuetyped.red}" }
      },
      "deep": {"deep": {"deep": {"deep": {"deep": {"$type": "color", "$value": "#FF0000" }}}}}
    },
    "spacing": {
      "$type": "number",
      "some numbers": {
        "spacer0": {"$value": 0},
        "spacerXs": {"$value": 4},
        "spacerS": {"$value": 8},
        "spacerM": {"$value": 16},
        "spacerX": {"$value": 24},
        "spacerXl": {"$value": 32},
        "spacerXxl": {"$value": 40},
        "spacex": {
          "funniness": {"$value": 0},
          "cleverness": {"$value": 1}
        }
      }
    }
  }`,
  };
}
// https://github.com/drwpow/cobalt-ui
function exampleJSONApple() {
  return {
    fileName: "Apple Human Interface Guidelines",
    body: `{
    "color": {
      "$type": "color",
      "$extensions": {"requiredModes": ["light", "dark", "light_ax", "dark_ax"]},
      "systemBlue": {
        "$value": "#007aff",
        "$extensions": {"mode": {"light": "#007aff", "dark": "#0a84ff", "light_ax": "#0040dd", "dark_ax": "#409cff"}}
      },
      "systemBrown": {
        "$value": "#a2845e",
        "$extensions": {"mode": {"light": "#a2845e", "dark": "#ac8e68", "light_ax": "#7f6545", "dark_ax": "#b59469"}}
      },
      "systemCyan": {
        "$value": "#32ade6",
        "$extensions": {"mode": {"light": "#32ade6", "dark": "#64d2ff", "light_ax": "#0071a4", "dark_ax": "#70d7ff"}}
      },
      "systemGray": {
        "$value": "#8e8e93",
        "$extensions": {"mode": {"light": "#8e8e93", "dark": "#8e8e93", "light_ax": "#6c6c70", "dark_ax": "#aeaeb2"}}
      },
      "systemGray2": {
        "$value": "#aeaeb2",
        "$extensions": {"mode": {"light": "#aeaeb2", "dark": "#636366", "light_ax": "#8e8e93", "dark_ax": "#7c7c80"}}
      },
      "systemGray3": {
        "$value": "#c7c7cc",
        "$extensions": {"mode": {"light": "#c7c7cc", "dark": "#48484a", "light_ax": "#aeaeb2", "dark_ax": "#545456"}}
      },
      "systemGray4": {
        "$value": "#d1d1d6",
        "$extensions": {"mode": {"light": "#d1d1d6", "dark": "#3a3a3c", "light_ax": "#bcbcc0", "dark_ax": "#444446"}}
      },
      "systemGray5": {
        "$value": "#e5e5ea",
        "$extensions": {"mode": {"light": "#e5e5ea", "dark": "#2c2c2e", "light_ax": "#d8d8dc", "dark_ax": "#363638"}}
      },
      "systemGray6": {
        "$value": "#f2f2f7",
        "$extensions": {"mode": {"light": "#f2f2f7", "dark": "#1c1c1e", "light_ax": "#ebebf0", "dark_ax": "#242426"}}
      },
      "systemGreen": {
        "$value": "#34c759",
        "$extensions": {"mode": {"light": "#34c759", "dark": "#30d158", "light_ax": "#248a3d", "dark_ax": "#30db5b"}}
      },
      "systemIndigo": {
        "$value": "#5856d6",
        "$extensions": {"mode": {"light": "#5856d6", "dark": "#5e5ce6", "light_ax": "#3634a3", "dark_ax": "#7d7aff"}}
      },
      "systemMint": {
        "$value": "#00c7be",
        "$extensions": {"mode": {"light": "#00c7be", "dark": "#66d4cf", "light_ax": "#0c817b", "dark_ax": "#66d4cf"}}
      },
      "systemOrange": {
        "$value": "#ff9500",
        "$extensions": {"mode": {"light": "#ff9500", "dark": "#ff9f0a", "light_ax": "#c93400", "dark_ax": "#ffb340"}}
      },
      "systemPurple": {
        "$value": "#af52de",
        "$extensions": {"mode": {"light": "#af52de", "dark": "#bf5af2", "light_ax": "#8944ab", "dark_ax": "#da8fff"}}
      },
      "systemPink": {
        "$value": "#ff2d55",
        "$extensions": {"mode": {"light": "#ff2d55", "dark": "#ff375f", "light_ax": "#d30f45", "dark_ax": "#ff6482"}}
      },
      "systemRed": {
        "$value": "#ff3b30",
        "$extensions": {"mode": {"light": "#ff3b30", "dark": "#ff453a", "light_ax": "#d70015", "dark_ax": "#ff6961"}}
      },
      "systemTeal": {
        "$value": "#30b0c7",
        "$extensions": {"mode": {"light": "#30b0c7", "dark": "#40c8e0", "light_ax": "#008299", "dark_ax": "#5de6ff"}}
      },
      "systemYellow": {
        "$value": "#ffcc00",
        "$extensions": {"mode": {"light": "#ffcc00", "dark": "#ffd60a", "light_ax": "#b25000", "dark_ax": "#ffd426"}}
      }
    }
  }`,
  };
}
function exampleJSONGithub() {
  return {
    fileName: "GitHub Primer Design System",
    body: `{
    "color": {
      "$type": "color",
      "Color Palette": {
        "black": { "$value": "#1b1f24" },
        "blue0": { "$value": "#ddf4ff" },
        "blue1": { "$value": "#b6e3ff" },
        "blue2": { "$value": "#80ccff" },
        "blue3": { "$value": "#54aeff" },
        "blue4": { "$value": "#218bff" },
        "blue5": { "$value": "#0969da" },
        "blue6": { "$value": "#0550ae" },
        "blue7": { "$value": "#033d8b" },
        "blue8": { "$value": "#0a3069" },
        "blue9": { "$value": "#002155" },
        "coral0": { "$value": "#FFF0EB" },
        "coral1": { "$value": "#FFD6CC" },
        "coral2": { "$value": "#FFB4A1" },
        "coral3": { "$value": "#FD8C73" },
        "coral4": { "$value": "#EC6547" },
        "coral5": { "$value": "#C4432B" },
        "coral6": { "$value": "#9E2F1C" },
        "coral7": { "$value": "#801F0F" },
        "coral8": { "$value": "#691105" },
        "coral9": { "$value": "#510901" },
        "gray0": { "$value": "#f6f8fa" },
        "gray1": { "$value": "#eaeef2" },
        "gray2": { "$value": "#d0d7de" },
        "gray3": { "$value": "#afb8c1" },
        "gray4": { "$value": "#8c959f" },
        "gray5": { "$value": "#6e7781" },
        "gray6": { "$value": "#57606a" },
        "gray7": { "$value": "#424a53" },
        "gray8": { "$value": "#32383f" },
        "gray9": { "$value": "#24292f" },
        "green0": { "$value": "#dafbe1" },
        "green1": { "$value": "#aceebb" },
        "green2": { "$value": "#6fdd8b" },
        "green3": { "$value": "#4ac26b" },
        "green4": { "$value": "#2da44e" },
        "green5": { "$value": "#1a7f37" },
        "green6": { "$value": "#116329" },
        "green7": { "$value": "#044f1e" },
        "green8": { "$value": "#003d16" },
        "green9": { "$value": "#002d11" },
        "orange0": { "$value": "#fff1e5" },
        "orange1": { "$value": "#ffd8b5" },
        "orange2": { "$value": "#ffb77c" },
        "orange3": { "$value": "#fb8f44" },
        "orange4": { "$value": "#e16f24" },
        "orange5": { "$value": "#bc4c00" },
        "orange6": { "$value": "#953800" },
        "orange7": { "$value": "#762c00" },
        "orange8": { "$value": "#5c2200" },
        "orange9": { "$value": "#471700" },
        "pink0": { "$value": "#ffeff7" },
        "pink1": { "$value": "#ffd3eb" },
        "pink2": { "$value": "#ffadda" },
        "pink3": { "$value": "#ff80c8"},
        "pink4": { "$value": "#e85aad"},
        "pink5": { "$value": "#bf3989"},
        "pink6": { "$value": "#99286e"},
        "pink7": { "$value": "#772057"},
        "pink8": { "$value": "#611347"},
        "pink9": { "$value": "#4d0336"},
        "purple0": { "$value": "#fbefff"},
        "purple1": { "$value": "#ecd8ff"},
        "purple2": { "$value": "#d8b9ff"},
        "purple3": { "$value": "#c297ff"},
        "purple4": { "$value": "#a475f9"},
        "purple5": { "$value": "#8250df"},
        "purple6": { "$value": "#6639ba"},
        "purple7": { "$value": "#512a97"},
        "purple8": { "$value": "#3e1f79"},
        "purple9": { "$value": "#2e1461"},
        "red0": { "$value": "#FFEBE9"},
        "red1": { "$value": "#ffcecb"},
        "red2": { "$value": "#ffaba8"},
        "red3": { "$value": "#ff8182"},
        "red4": { "$value": "#fa4549"},
        "red5": { "$value": "#cf222e"},
        "red6": { "$value": "#a40e26"},
        "red7": { "$value": "#82071e"},
        "red8": { "$value": "#660018"},
        "red9": { "$value": "#4c0014"},
        "yellow0": { "$value": "#fff8c5"},
        "yellow1": { "$value": "#fae17d"},
        "yellow2": { "$value": "#eac54f"},
        "yellow3": { "$value": "#d4a72c"},
        "yellow4": { "$value": "#bf8700"},
        "yellow5": { "$value": "#9a6700"},
        "yellow6": { "$value": "#7d4e00"},
        "yellow7": { "$value": "#633c01"},
        "yellow8": { "$value": "#4d2d00"},
        "yellow9": { "$value": "#3b2300"},
        "white": { "$value": "#ffffff"}
      }
    },
    "spacing": {
      "$type": "number",
      "Numbers": {
        "spacer0": {"$value": 0},
        "spacerXs": {"$value": 4},
        "spacerS": {"$value": 8},
        "spacerM": {"$value": 16},
        "spacerX": {"$value": 24},
        "spacerXl": {"$value": 32},
        "spacerXxl": {"$value": 40}
      }
    }
  }`,
  };
}

function rgbToHex({ r, g, b, a }) {
  if (a !== 1) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(4)})`;
  }
  const toHex = (value) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
}

function parseColor(color) {
  color = color.trim();
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/;
  const hslRegex = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;
  const hslaRegex =
    /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*([\d.]+)\s*\)$/;
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const floatRgbRegex =
    /^\{\s*r:\s*[\d\.]+,\s*g:\s*[\d\.]+,\s*b:\s*[\d\.]+(,\s*opacity:\s*[\d\.]+)?\s*\}$/;

  if (rgbRegex.test(color)) {
    const [, r, g, b] = color.match(rgbRegex);
    return { r: parseInt(r) / 255, g: parseInt(g) / 255, b: parseInt(b) / 255 };
  } else if (rgbaRegex.test(color)) {
    const [, r, g, b, a] = color.match(rgbaRegex);
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      opacity: a,
    };
  } else if (hslRegex.test(color)) {
    const [, h, s, l] = color.match(hslRegex);
    return hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100);
  } else if (hslaRegex.test(color)) {
    const [, h, s, l, a] = color.match(hslaRegex);
    return Object.assign(
      hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100),
      { opacity: a }
    );
  } else if (hexRegex.test(color)) {
    const hexValue = color.substring(1);
    const expandedHex =
      hexValue.length === 3
        ? hexValue
            .split("")
            .map((char) => char + char)
            .join("")
        : hexValue;
    return {
      r: parseInt(expandedHex.slice(0, 2), 16) / 255,
      g: parseInt(expandedHex.slice(2, 4), 16) / 255,
      b: parseInt(expandedHex.slice(4, 6), 16) / 255,
    };
  } else if (floatRgbRegex.test(color)) {
    return JSON.parse(color);
  } else {
    throw new Error("Invalid color format");
  }
}

function hslToRgbFloat(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, (h + 1 / 3) % 1);
  const g = hue2rgb(p, q, h % 1);
  const b = hue2rgb(p, q, (h - 1 / 3) % 1);

  return { r, g, b };
}
