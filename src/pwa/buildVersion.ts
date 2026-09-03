// App build version, baked at build time via vite `define`.
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : "";
export const APP_COMMIT: string =
  typeof __APP_COMMIT__ !== "undefined" ? __APP_COMMIT__ : "not-available";
