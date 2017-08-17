# Fennec Profiler Addon

## Instructions

* Locally build and install Fennec. https://developer.mozilla.org/en-US/docs/Mozilla/Developer_guide/Build_Instructions/Simple_Firefox_for_Android_build
* Start Fennec on your device and go to `about:config`. Change `xpinstall.signatures.required` to `false`.
* Clone this repo
* Run `npm install` in the checkout
* Run `./build`. This will install the addon into your local build of Fennec on the device. You will need to approve some on-screen prompts.
* You should now have a "Start Profiler" entry in the three-dot menu. Selecting it once will start the profiler, and selecting it again will stop it. When the profiler stops, it writes the JSON output into `/sdcard/gecko_profile.json` on the device. Make sure you have the storage permission enabled for Fennec.
* You can use the `symbolicate` tool in the repo to pull the profile from the device and symbolicate it using your object directory. First pull the libraries off the device with `./symbolicate pull-libs`. You only need to do this once for each device you are using. Once this is complete, pull the profile and symbolicate it with `./symbolicate pull-profile --objdir ~/objdir-android`. Substitute the correct path for your Gecko object directory.
* Finally, you can open the profile in https://perf-html.io and analyze the profile.