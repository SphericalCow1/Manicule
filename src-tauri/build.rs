fn main() {
    // Bundle generation is disabled for local builds, so track the runtime icon
    // inputs explicitly instead of relying on Tauri's bundle dependencies.
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
