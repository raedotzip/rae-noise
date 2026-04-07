use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn process_vertices(data: &[f32]) -> Vec<f32> {
    // heavy computation here
    data.iter().map(|x| x * 2.0).collect()
}