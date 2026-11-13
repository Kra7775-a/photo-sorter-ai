// The package only ships types for its root entry point; the core entry point
// exposes the same reader/writer API without the filesystem wrapper.
declare module "@zip.js/zip.js/lib/zip-core-native.js" {
  export * from "@zip.js/zip.js";
}
