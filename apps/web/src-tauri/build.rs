fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_university_browser",
            "capture_university_page",
            "check_for_updates",
            "open_external_link",
            "verify_legacy_local_account",
        ]),
    );
    tauri_build::try_build(attributes).expect("failed to configure Tauri permissions");
}
