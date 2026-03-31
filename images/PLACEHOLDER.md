# Icon placeholder

Place a 128×128 PNG file named `icon.png` here before publishing to the Marketplace.

Requirements (from the VS Code Marketplace docs):
- Format: PNG
- Size: 128×128 pixels
- Background: solid (not transparent)

You can create one for free at https://www.canva.com or https://icon.kitchen.
Then update `"icon": "images/icon.png"` in `package.json` (it's already set).

Until you add the icon, remove the `"icon"` line from `package.json` to avoid
a packaging warning.
