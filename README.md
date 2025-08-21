# CrossCode

[![Build CrossCode](https://github.com/nab138/CrossCode/actions/workflows/build.yml/badge.svg)](https://github.com/nab138/CrossCode/actions/workflows/build.yml)

iOS Development IDE for linux and windows, built with [Tauri](https://tauri.app/).

Coming soon...

## Installation

CrossCode is currently in development and not recommended for use. However, if you want to try it out, your feedback would be greatly appreciated!

You can download the latest build from [actions](https://github.com/nab138/CrossCode/actions/workflows/build.yml).

## How it works

- A darwin SDK is generated from a user provided copy of Xcode 16.3 (extracted with [unxip](https://github.com/saagarjha/unxip)) and darwin tools from [darwin-tools-linux-llvm](https://github.com/xtool-org/darwin-tools-linux-llvm)
- Swift uses the darwin SDK to build an executable which is packaged into an .app bundle.
- The code to sign and install apps onto a device has been removed from CrossCode's source and moved to a standalone package, [isideload](https://github.com/nab138/isideload). It was built on a lot of other libraries, so check out its README for more info.

Supports swift 6.1 and the swift package manager.

## Progress

The app is currently functional but does not have all the features it should. You can see a tentative plan for the future [on trello](https://trello.com/b/QYQFfOvm/ycode)

## Credits

- [idevice](https://github.com/jkcoxson/idevice) is used to communicate with iOS devices.
- [xtool](https://xtool.sh) has been used as a reference for the implementation of the darwin SDK generation.
- [Sideloader](https://github.com/Dadoum/Sideloader) has been heavily used as a reference for the implementation of the Apple Developer APIs and sideloading process.

### AI Usage

- Generated the logo (I'm sorry, its only temporary I promise)
- Helped port small sections of code from [Sideloader](https://github.com/Dadoum/Sideloader) because I'm not familiar with dlang syntax
