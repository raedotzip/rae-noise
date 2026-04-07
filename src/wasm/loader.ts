// let instance: MyWasmExports | null = null;

// export async function getWasm(): Promise<MyWasmExports> {
//   if (instance) return instance;

//   // Bundler-friendly URL resolution — works with Vite, Webpack 5, Rollup
//   const wasmUrl = new URL('../../dist/wasm/my_crate_bg.wasm', import.meta.url);

//   // Streaming compile — fastest path, browser starts compiling during download
//   const wasm = await import('../../dist/wasm/my_crate.js');
//   await wasm.default(wasmUrl);

//   instance = wasm as unknown as MyWasmExports;
//   return instance;
// }