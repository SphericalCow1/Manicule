#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

fn main() {
    semtags_lib::run();
}
