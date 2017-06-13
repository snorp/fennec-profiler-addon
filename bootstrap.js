const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

let DEFAULT_PROFILER_ENTRIES = 1000000;
let DEFAULT_PROFILER_INTERVAL = 1;
let DEFAULT_PROFILER_FEATURES = ["js", "threads", "leaf"];
let DEFAULT_PROFILER_THREAD_NAMES = ["Compositor", "GeckoMain"];

let DEFAULT_PROFILE_PATH = "/sdcard/gecko_profile.json";

let profiler = Cc["@mozilla.org/tools/profiler;1"].getService(Ci.nsIProfiler);

let Log = Cu.import("resource://gre/modules/AndroidLog.jsm", {}).AndroidLog;

// Define the "dump" function as a binding of the Log.d function so it specifies
// the "debug" priority and a log tag.
let dump = Log.d.bind(null, "ProfilerAddon");

// An example of how to import a helper module.
XPCOMUtils.defineLazyGetter(this, "Helper", function() {
  let sandbox = {};
  Services.scriptloader.loadSubScript("chrome://youraddon/content/helper.js", sandbox);
  return sandbox["Helper"];
});

function showToast(aWindow, aMessage) {
  aWindow.NativeWindow.toast.show(aMessage, "short");
}

var gProfilerMenuId = null;

function getMenuLabel() {
  return profiler.IsActive() ? 'Stop Profiler' : 'Start Profiler';
}

function updateMenus() {
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    domWindow.NativeWindow.menu.update(gProfilerMenuId, {
      name: getMenuLabel(),
      checked: profiler.IsActive()
    });
  }
}

var ProfilerObserver = {
  init: function() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    Services.obs.addObserver(this, 'profiler-started', false);
    Services.obs.addObserver(this, 'profiler-stopped', false);
  },
  shutdown: function() {
    if (!this._inited) {
      return;
    }

    this._inited = false;
    Services.obs.removeObserver(this, 'profiler-started');
    Services.obs.removeObserver(this, 'profiler-stopped');
  },
  observe: function(subject, topic, data) {
    updateMenus();
  }
};

function loadIntoWindow(window) {  
  gProfilerMenuId = window.NativeWindow.menu.add({
    name: getMenuLabel(),
    checkable: true,
    checked: profiler.IsActive(),
    callback: function() {
      if (!profiler.IsActive()) {
        profiler.StartProfiler(DEFAULT_PROFILER_ENTRIES,
                               DEFAULT_PROFILER_INTERVAL,
                               DEFAULT_PROFILER_FEATURES,
                               DEFAULT_PROFILER_FEATURES.length,
                               DEFAULT_PROFILER_THREAD_NAMES,
                               DEFAULT_PROFILER_THREAD_NAMES.length);
        showToast(window, 'Profiler started!');
      } else {
        profiler.dumpProfileToFile(DEFAULT_PROFILE_PATH);
        profiler.StopProfiler();
        showToast(window, 'Wrote profile to: ' + DEFAULT_PROFILE_PATH);
      }
    }
  });
}

function unloadFromWindow(window) {
  window.NativeWindow.menu.remove(gProfilerMenuId);
}

/**
 * bootstrap.js API
 */
var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
  
  onCloseWindow: function(aWindow) {
  },
  
  onWindowTitleChange: function(aWindow, aTitle) {
  }
};

function startup(aData, aReason) {
  // Load into any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  Services.wm.addListener(windowListener);

  ProfilerObserver.init();
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN) {
    return;
  }

  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }

  ProfilerObserver.shutdown();
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}
