#!/usr/bin/env bash
# Patches the Capacitor-generated iOS project: permissions text, export compliance, orientation, icon, splash.
set -euo pipefail
PL=ios/App/App/Info.plist
PB=/usr/libexec/PlistBuddy
set_str() { $PB -c "Delete :$1" "$PL" >/dev/null 2>&1 || true; $PB -c "Add :$1 string $2" "$PL"; }
set_bool() { $PB -c "Delete :$1" "$PL" >/dev/null 2>&1 || true; $PB -c "Add :$1 bool $2" "$PL"; }
set_str NSMicrophoneUsageDescription "声をリアルタイムに変換・録音するためにマイクを使います。"
set_str NSCameraUsageDescription "変換ボイス付きの動画撮影と、メモリチップの写真撮影にカメラを使います。"
set_str NSPhotoLibraryUsageDescription "メモリチップに使う写真を選ぶために写真ライブラリを使います。"
set_str NSPhotoLibraryAddUsageDescription "撮影した動画を写真に保存するために使います。"
set_str CFBundleDisplayName "VOXM"
set_bool ITSAppUsesNonExemptEncryption false
set_str UIStatusBarStyle "UIStatusBarStyleLightContent"
# iPhone only, portrait only. (An iPad build would have to support all four orientations — App Store error 90474.)
$PB -c "Delete :UISupportedInterfaceOrientations~ipad" "$PL" >/dev/null 2>&1 || true
$PB -c "Delete :UISupportedInterfaceOrientations" "$PL" >/dev/null 2>&1 || true
$PB -c "Add :UISupportedInterfaceOrientations array" "$PL"
$PB -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PL"
set_bool UIRequiresFullScreen true
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' ios/App/App.xcodeproj/project.pbxproj
# native audio helper plugin (speaker routing + earphone detection)
APPDEL=ios/App/App/AppDelegate.swift
SB=ios/App/App/Base.lproj/Main.storyboard
if ! grep -q VoxAudioPlugin "$APPDEL"; then
  grep -q "^import AVFoundation" "$APPDEL" || sed -i '' 's/^import Capacitor$/import Capacitor\
import AVFoundation/' "$APPDEL"
  cat ci/native/VoxAudio.swift >> "$APPDEL"
fi
sed -i '' 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="VoxBridgeViewController" customModule="App" customModuleProvider="target"/' "$SB"
if grep -q VoxBridgeViewController "$SB"; then echo "VoxAudio plugin wired"; else echo "::warning::Main.storyboard not patched; VoxAudio plugin unavailable"; grep -n "viewController" "$SB" || true; fi
grep -n "^import" "$APPDEL"
ICONSET=ios/App/App/Assets.xcassets/AppIcon.appiconset
for f in "$ICONSET"/*.png; do cp assets/icon-1024.png "$f"; done
SPLASH=ios/App/App/Assets.xcassets/Splash.imageset
if [ -d "$SPLASH" ]; then for f in "$SPLASH"/*.png; do cp assets/splash-2732.png "$f"; done; fi
echo "iOS project prepared:"; $PB -c "Print" "$PL" | head -60
