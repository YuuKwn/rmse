const fs = require('fs');
const fsprom = fs.promises;
const path = require('path');

class null_codec {
	constructor(rm_root) {
		this.rm_root = rm_root;
	}

	decode(savefile_path) {
		const json = fs.readFileSync(savefile_path, {
			encoding: 'utf-8'
		});
		return json;
	}

	encode(json_str) {
		return json_str;
	}
}

class pako_codec {
	constructor(pako_path) {
		this.pako = require(pako_path);
	}

	decode(savefile_path) {
		const zipdata = fs.readFileSync(savefile_path, {
			encoding: 'utf-8'
		});
		const json = this.pako.inflate(zipdata, {
			to: "string"
		});
		return json;
	}

	encode(json_str) {
		return this.pako.deflate(json_str, {
			to: "string",
			level: 1
		});
	}
}

class lz_codec {
	constructor(lz_path) {
		this.lzstring = require(lz_path);
	}

	decode(savefile_path) {
		const zipdata = fs.readFileSync(savefile_path, {
			encoding: 'utf-8'
		});
		const json = this.lzstring.decompressFromBase64(zipdata);
		return json;
	}

	encode(json_str) {
		return this.lzstring.compressToBase64(json_str);
	}
}

function get_rm_root(curr_path) {
	// I'm not super familiar with RPGMaker so I don't know if this function is
	// 100% reliable. I also don't know if this will work on Windows with its
	// weird paths. YOLO
	try { // Add basic error handling for FS operations
		if (fs.existsSync(path.join(curr_path, 'Game')) ||
			fs.existsSync(path.join(curr_path, 'nw'))   ||
			fs.existsSync(path.join(curr_path, 'Game.exe')) ||
			fs.existsSync(path.join(curr_path, 'nw.exe'))) {
			// This is currently the rm root!
			return curr_path;
		}
	} catch (err) {
		console.error(`Error checking for RM root indicators in ${curr_path}: ${err}`);
		return null; // Fail gracefully if FS error occurs
	}


	let updir = path.dirname(curr_path);
	if (updir == curr_path) {
		// End the recursion
		return null;
	}

	return get_rm_root(updir);
}

function build_codec(file_path, rm_root) {
	let pakopath = path.join(rm_root, 'js', 'libs', 'pako.min.js');
	let lzpath = path.join(rm_root, 'www', 'js', 'libs', 'lz-string.js');
	let codec = null;

	if (path.extname(file_path) == '.json') {
		codec = new null_codec(rm_root);
	} else { // Check for codecs only if it's not raw JSON
        try { // Wrap FS checks
            if (fs.existsSync(pakopath)) {
                // Build pako decodec
                codec = new pako_codec(pakopath);
            } else if (fs.existsSync(lzpath)) {
                // Build lz-string decodec
                codec = new lz_codec(lzpath);
            } else {
                // Fallback or error if no known save format/codec library found
                console.error(`Could not find pako (${pakopath}) or lz-string (${lzpath}). Assuming uncompressed format for ${file_path}`);
                // Decide on fallback behavior: null_codec or throw error?
                codec = new null_codec(rm_root); // Assuming uncompressed if libs missing
            }
        } catch (err) {
            console.error(`Error checking for codec libraries: ${err}`);
             codec = new null_codec(rm_root); // Fallback on error
        }
    }


	return codec;
}

/**
 * Get the context for the savefile.
 *
 * A save file needs some context from the game engine to make sense. This
 * context is stored in JSON files in certain locations within the game
 * directory. This function will pull those files and pass them with the
 * savefile data.
 */
function get_context(file_path) {
	let context = {
		savefile: file_path
	};

	// Find the data directory
	let savedir = path.dirname(file_path);
	let maindir = path.dirname(savedir);
	let datadir = path.join(maindir, 'data');

	try { // Wrap FS check
		if (!fs.existsSync(datadir)) {
			console.error('Could not find data dir for ' + file_path + ` (expected at ${datadir})`);
			return {}; // Return empty context if data dir not found
		}
	} catch (err) {
		console.error(`Error checking for data directory ${datadir}: ${err}`);
		return {};
	}


	// Load the context
	let context_files = {
		items: path.join(datadir, 'Items.json'),
		armors: path.join(datadir, 'Armors.json'),
		weapons: path.join(datadir, 'Weapons.json'),
		variables: path.join(datadir, 'System.json'),
		// --- Add Skills.json here ---
		skills: path.join(datadir, 'Skills.json') // <-- Added line
		// ----------------------------
	};

	Object.entries(context_files).forEach((entry) => {
		const [key, filepath] = entry; // Use const/let
		try { // Wrap FS check and readFileSync
			if (fs.existsSync(filepath)) {
				context[key] = fs.readFileSync(filepath, {
					encoding: 'utf-8'
				});
			} else {
				console.warn(`Context file not found: ${filepath}`); // Warn if a file is missing
			}
		} catch (err) {
			console.error(`Failed to read context file ${filepath}: ${err}`);
			// Decide if you want to return partial context or fail entirely
		}
	});

	return context;
}


function load(file_path) {
	let rm_root = get_rm_root(file_path);
	if (rm_root === null) {
		console.error('Could not find RPGMaker root dir...aborting');
		// Could possibly prompt user?
		return null;
	}
	let codec = build_codec(file_path, rm_root);
    if (!codec) {
         console.error('Could not determine save file encoding (no codec found)...aborting');
         return null;
    }
    let json = null;
    try {
	    json = codec.decode(file_path);
    } catch(err) {
        console.error(`Error decoding file ${file_path}: ${err}`);
        return null;
    }

	let context = get_context(file_path);

	context['json_txt'] = json;
	context['rm_root'] = rm_root;
	return context;
}

async function save(file_path, json_str, rm_root) {
	let codec = build_codec(file_path, rm_root);
    if (!codec) {
         console.error('Could not determine save file encoding for saving (no codec found)...aborting');
         return '';
    }
    let strdata = '';
    try {
        strdata = codec.encode(json_str);
    } catch(err) {
        console.error(`Error encoding data for file ${file_path}: ${err}`);
        return '';
    }


	try {
		await fsprom.writeFile(file_path, strdata);
	} catch (err) {
		console.error('Error saving file ' + file_path + ': ' + err); // Use console.error
		return '';
	}
	return file_path;
}

exports.load = load;
exports.save = save;
exports.get_rm_root = get_rm_root;