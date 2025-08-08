const {
	contextBridge,
	ipcRenderer
} = require('electron');
const path = require('path'); // Keep path here if needed for basename in callback

// Set up APIs for sandboxed environment
contextBridge.exposeInMainWorld('ipc_bridge', {
	// File operations (remain the same)
	load_file: (file_path, callback) => {
		ipcRenderer.invoke('load_file', file_path).then((result) => {
            // Pass base filename back in the callback if needed
            const baseName = result ? path.basename(result.savefile) : file_path;
			callback(baseName, result);
		});
	},
	open_file: (callback) => {
		ipcRenderer.invoke('open_file').then((result) => {
            const baseName = result ? path.basename(result.savefile) : '';
			callback(baseName, result);
		});
	},
	save_file: (file_path, json_str, rm_root, callback) => {
		ipcRenderer.invoke('save_file', file_path, json_str, rm_root).then((result) => {
			callback(result); // Result is the saved path or ''
		});
	},
	dump_json: (json_str, rm_root, callback) => {
		ipcRenderer.invoke('dump_json', json_str, rm_root).then((result) => {
			callback(result);
		});
	},
	version: () => {
		return ipcRenderer.sendSync('get_version');
	},

    // --- NEW: Local Storage Bridge ---
    saveToStorage: (key, value) => {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.error("Error saving to localStorage via preload:", e);
            return false;
        }
    },
    loadFromStorage: (key) => {
         try {
            return localStorage.getItem(key);
        } catch (e) {
            console.error("Error loading from localStorage via preload:", e);
            return null;
        }
    }
    // --- End NEW ---
});

window.addEventListener('DOMContentLoaded', () => {
    // You could potentially load initial pins here if needed before renderer.js runs fully
});