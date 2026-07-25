import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve(".openai", "hosting.json");
const destination = resolve("dist", ".openai", "hosting.json");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log("Copied Sites hosting manifest into dist.");
