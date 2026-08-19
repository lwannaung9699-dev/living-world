import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code !== "ERR_MODULE_NOT_FOUND" && err.code !== "ERR_UNSUPPORTED_DIR_IMPORT") {
      throw err;
    }
    // Only attempt relative/absolute specifiers with no extension
    if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("file://")) {
      const base = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
      const dir = path.dirname(base);
      const target = specifier.startsWith("file://") ? fileURLToPath(specifier) : path.resolve(dir, specifier);
      const candidates = [
        target + ".ts",
        path.join(target, "index.ts"),
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    throw err;
  }
}
