import { createSystem, defaultConfig } from "@chakra-ui/react"
import { buttonRecipe } from "./theme/button.recipe"
import { inputRecipe } from "./theme/input.recipe"

export const system = createSystem(defaultConfig, {
  globalCss: {
    html: {
      fontSize: "16px",
    },
    body: {
      fontSize: "0.875rem",
      margin: 0,
      padding: 0,
    },
    ".main-link": {
      color: "ui.primary",
      fontWeight: "bold",
    },
  },
  theme: {
    tokens: {
      colors: {
        main: {
          50: { value: "#eaf2ee" },
          100: { value: "#cbdfd8" },
          200: { value: "#a8c6bb" },
          300: { value: "#84ad9e" },
          400: { value: "#619481" },
          500: { value: "#2b5e4e" },
          600: { value: "#265646" },
          700: { value: "#204c3d" },
          800: { value: "#1a4234" },
          900: { value: "#14382b" },
        },
        accent: {
          50: { value: "#f2eaea" },
          100: { value: "#dfcbcb" },
          200: { value: "#c6a8a8" },
          300: { value: "#ad8484" },
          400: { value: "#946161" },
          500: { value: "#5e2b3b" },
          600: { value: "#562636" },
          700: { value: "#4c2030" },
          800: { value: "#421a2a" },
          900: { value: "#381424" },
        },
        ui: {
          primary: { value: "{colors.main.500}" },
          hover: { value: "{colors.accent.500}" },
          disabled: { value: "#567666" },
          danger: { value: "#e53e3e" },
          dangerHover: { value: "#c53030" },
        },
      },
      radii: {
        l1: { value: "2rem" },
        l2: { value: "2rem" },
        l3: { value: "2rem" },
      },
    },
    recipes: {
      button: buttonRecipe,
      input: inputRecipe,
    },
  },
})
