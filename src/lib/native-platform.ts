import { Platform } from "react-native";

declare global {
  var Platform: typeof import("react-native").Platform;
}

// Keep the React Native platform value available to legacy app-shell code that
// references Platform as a global. New modules should import Platform directly.
globalThis.Platform = Platform;
