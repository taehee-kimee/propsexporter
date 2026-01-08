# Props Exporter (YAML/JSON) - Figma Plugin

A simple Figma plugin that exports component properties to YAML/JSON for documentation and handoff.

## 📁 Files Overview

- **manifest.json** - Plugin configuration file that tells Figma about your plugin
- **code.ts** - Main plugin logic (TypeScript) - runs in Figma's backend
- **ui.html** - User interface with textarea and copy button
- **package.json** - Node.js dependencies
- **tsconfig.json** - TypeScript compiler configuration

## 🚀 Setup Instructions

### Step 1: Install Dependencies

Open a terminal in this folder and run:

```bash
npm install
```

This will install:
- TypeScript compiler
- Figma plugin type definitions

### Step 2: Compile TypeScript

Compile the `code.ts` file to JavaScript:

```bash
npm run build
```

This creates a `code.js` file that Figma will execute.

**💡 Tip:** You can also run `npm run watch` to automatically recompile when you make changes to `code.ts`.

### Step 3: Load the Plugin in Figma

1. Open **Figma Desktop App** (plugins don't work in the browser for development)
2. Go to **Menu** → **Plugins** → **Development** → **Import plugin from manifest...**
3. Navigate to this folder and select the `manifest.json` file
4. Click **Open**

Your plugin is now loaded! 🎉

## 🎯 How to Use

1. In Figma, create or select a **Component** or **Component Set** (with variants)
2. Right-click and go to **Plugins** → **Development** → **Props Exporter (YAML/JSON)**
3. Click **Export Properties** button in the plugin window
4. The JSON will appear in the textarea
5. Click **Copy JSON** to copy it to your clipboard

## 📝 Example Output

For a Button component with properties:
- size: sm, md, lg (variant)
- appearance: primary, secondary, ghost (variant)
- disabled: true/false (boolean)

The plugin generates:

```json
{
  "Button": {
    "props": {
      "size": {
        "type": "enum",
        "values": ["sm", "md", "lg"]
      },
      "appearance": {
        "type": "enum",
        "values": ["primary", "secondary", "ghost"]
      },
      "disabled": {
        "type": "boolean"
      }
    }
  }
}
```

## 🛠️ Making Changes

1. Edit `code.ts` (plugin logic) or `ui.html` (user interface)
2. Run `npm run build` to recompile TypeScript
3. In Figma, right-click → **Plugins** → **Development** → **Props Exporter (YAML/JSON)** to test your changes

## 📚 Learn More

- [Figma Plugin API Documentation](https://www.figma.com/plugin-docs/)
- [Component Properties API](https://www.figma.com/plugin-docs/api/properties/ComponentNode-componentpropertydefinitions/)
- [Plugin Development Tutorial](https://www.figma.com/plugin-docs/setup/)

## ❓ Troubleshooting

**Plugin doesn't appear in menu:**
- Make sure you're using Figma Desktop App (not browser)
- Try re-importing the manifest.json file

**"code.js not found" error:**
- Run `npm run build` to compile TypeScript to JavaScript

**Changes not showing:**
- Run `npm run build` after editing code.ts
- Close and reopen the plugin in Figma

**Empty JSON output:**
- Make sure you're selecting a Component or Component Set
- The component must have properties defined (boolean or variant properties)
