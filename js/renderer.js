// Runs in sandbox

// --- Global state ---
window.currentFileData = {}; // Holds data for the currently loaded file
window.currentFileSections = []; // Holds the section objects for the current file
const PINNED_ITEMS_STORAGE_KEY = 'rmsePinnedItems';
let pinnedItems = []; // Array to hold pinned item descriptors { type, id, name }
// --- End Global State ---


// Set the text of the given element
function set_text(selector, text) {
	const element = document.getElementById(selector);
	const status_p = document.getElementById('statustext');
	if (element && element.id === 'status' && status_p) {
		status_p.innerText = text;
	} else if (element) {
		element.innerText = text;
	} else {
		console.log("Could not find element with selector:", selector);
	}
}


// --- Pinning Logic ---
function loadPinsFromStorage() {
    const storedPinsJson = window.ipc_bridge.loadFromStorage(PINNED_ITEMS_STORAGE_KEY);
    if (storedPinsJson) {
        try {
            const storedPins = JSON.parse(storedPinsJson);
            if (Array.isArray(storedPins)) {
                pinnedItems = storedPins.filter(p => p && typeof p === 'object' && p.hasOwnProperty('type') && p.hasOwnProperty('id') && p.hasOwnProperty('name'));
                console.log("Loaded valid pins:", pinnedItems.length);
                return;
            } else { console.warn("Stored pins data is not an array:", storedPins); }
        } catch (e) { console.error("Failed to parse stored pins:", e); }
    }
    pinnedItems = []; console.log("No valid pins found in storage or load failed.");
}

function savePinsToStorage() {
    try { window.ipc_bridge.saveToStorage(PINNED_ITEMS_STORAGE_KEY, JSON.stringify(pinnedItems)); console.log("Saved pins:", pinnedItems.length); }
    catch (e) { console.error("Failed to stringify or save pins:", e); }
}

function isItemPinned(type, id) {
    const itemType = String(type).replace(/s$/, '');
    return pinnedItems.some(pin => pin.type.replace(/s$/, '') === itemType && String(pin.id) === String(id));
}

function togglePin(itemInfo, buttonElement) { // itemInfo = { type, id, name }
    const { type, id, name } = itemInfo;
    const normalizedType = String(type).replace(/s$/, '');
    const alreadyPinnedIndex = pinnedItems.findIndex(pin => pin.type.replace(/s$/, '') === normalizedType && String(pin.id) === String(id));

    if (alreadyPinnedIndex > -1) { // Unpin
        pinnedItems.splice(alreadyPinnedIndex, 1); console.log(`Unpinned: ${normalizedType} ${id} (${name})`);
    } else { // Pin
        pinnedItems.push({ type: normalizedType, id, name }); console.log(`Pinned: ${normalizedType} ${id} (${name})`);
    }

    savePinsToStorage();
    updatePinnedItemsDisplay();
    updatePinButtonStates();
}

function updatePinButtonStates() {
    const pinButtons = document.querySelectorAll('.pin-button');
    pinButtons.forEach(button => {
        const type = button.dataset.itemType;
        const id = button.dataset.itemId;
        if (isItemPinned(type, id)) {
            button.classList.add('pinned'); button.title = 'Unpin this item';
        } else {
            button.classList.remove('pinned'); button.title = 'Pin this item';
        }
    });
}

function createPinButton(itemInfo) { // itemInfo = { type, id, name }
    const { type, id, name } = itemInfo;
    const button = document.createElement('button');
    button.classList.add('pin-button');
    button.dataset.itemType = type; button.dataset.itemId = id; button.dataset.itemName = name;
    button.textContent = '📌';
    if (isItemPinned(type, id)) { button.classList.add('pinned'); button.title = 'Unpin this item'; }
    else { button.title = 'Pin this item'; }
    button.onclick = (e) => { e.stopPropagation(); togglePin({ type: type, id: id, name: name }, button); };
    return button;
}

// Creates editable items in pinned section
function updatePinnedItemsDisplay() {
    const pinnedContentDiv = document.getElementById('pinned-items-content');
    const pinnedSectionDiv = document.getElementById('pinned-items-section');
    if (!pinnedContentDiv || !pinnedSectionDiv) return;

    pinnedContentDiv.innerHTML = '';

    if (pinnedItems.length === 0) {
        pinnedSectionDiv.classList.add('section-hidden'); return;
    }

    const currentSaveData = window.currentFileData?.object;
    if (!currentSaveData) {
        pinnedSectionDiv.classList.add('section-hidden'); return;
    }

    let displayedPinCount = 0;
    pinnedItems.sort((a,b) => { if (a.type !== b.type) return a.type.localeCompare(b.type); return String(a.name).localeCompare(String(b.name)); });

    pinnedItems.forEach(pinInfo => {
        let interactiveItem = null; let itemElement = null; let exists = false;
        const numericId = parseInt(pinInfo.id); // ID for arrays

        try {
            switch(pinInfo.type) {
                case 'variable':
                    const varArray = get_rm_arr(currentSaveData.variables, '_data');
                    if (varArray && numericId > 0 && numericId < varArray.length && varArray[numericId] !== undefined) {
                        interactiveItem = new value_item(varArray, numericId, pinInfo.name, 'variable');
                        itemElement = interactiveItem.create_DOM(); exists = true;
                    }
                    break;
                case 'switch':
                     const switchArray = get_rm_arr(currentSaveData.switches, '_data');
                    if (switchArray && numericId > 0 && numericId < switchArray.length) {
                         if (switchArray[numericId] === undefined) switchArray[numericId] = false;
                        interactiveItem = new switch_item(switchArray, numericId, pinInfo.name);
                        itemElement = interactiveItem.create_DOM(); exists = true;
                    }
                    break;
                case 'item': case 'weapon': case 'armor':
                    const inventoryMap = currentSaveData.party?.[`_${pinInfo.type}s`];
                    if (inventoryMap) {
                        if (!inventoryMap.hasOwnProperty(pinInfo.id)) { inventoryMap[pinInfo.id] = 0; }
                        interactiveItem = new value_item(inventoryMap, pinInfo.id, pinInfo.name, pinInfo.type);
                        itemElement = interactiveItem.create_DOM(); exists = true;
                    }
                    break;
            }
        } catch (error) { console.error(`Error creating pinned item DOM for ${pinInfo.type} ${pinInfo.id}:`, error); exists = false; }

        if (exists && itemElement) {
            displayedPinCount++;
            itemElement.classList.add('pinned-item-in-section');
            pinnedContentDiv.appendChild(itemElement);
        } else { console.log(`Pinned item ${pinInfo.type} ${pinInfo.id} (${pinInfo.name}) not found or invalid in current save.`); }
    });

    pinnedSectionDiv.style.display = (displayedPinCount > 0) ? '' : 'none';
    pinnedSectionDiv.classList.toggle('section-hidden', displayedPinCount === 0);
    updatePinButtonStates();
}
// --- End Pinning Logic ---


/**
 * value_item Class (Modified to update data on input)
 */
class value_item {
	constructor(owner, field, label, type = 'value') {
		this.jobj = owner; this.field = field;
        if (owner[field] === undefined) { if (type === 'item' || type === 'weapon' || type === 'armor') owner[field] = 0; else if (type === 'variable') owner[field] = 0; else owner[field] = ''; }
        this.curr_val = owner[field];
        this.value_type = typeof this.curr_val !== 'undefined' ? typeof this.curr_val : 'string';
        this.labeltext = label || `${type} ${field}`; this.item_type = type;
        this.input_elem = null;
	}
	create_DOM() {
		let parent = document.createElement('div'); parent.classList.add('item'); parent.classList.add(`${this.item_type}-item`);
        const pinInfo = { type: this.item_type, id: this.field, name: this.labeltext };
        const pinButton = createPinButton(pinInfo); parent.appendChild(pinButton);
		let label = document.createElement('p'); label.classList.add('label'); label.textContent = this.labeltext;
		let input = document.createElement('input'); input.setAttribute('type', 'text'); input.classList.add('value'); input.value = this.curr_val !== undefined ? this.curr_val : ''; this.input_elem = input;
        input.addEventListener('input', () => this.update_value()); input.addEventListener('blur', () => this.update_value());
        parent.appendChild(label); parent.appendChild(input); return parent;
	}
	update_value() {
        if (!this.input_elem) return; var newval = ''; const raw_value = this.input_elem.value; const target_type = this.value_type;
        if (target_type == 'number') { newval = Number(raw_value); if (isNaN(newval)) { console.warn(`Invalid number input "${raw_value}" for field ${this.field}. Update skipped.`); return; } }
        else if (target_type == 'boolean') { newval = raw_value.toLowerCase() === 'true' || (raw_value !== '' && raw_value.toLowerCase() !== 'false' && raw_value !== '0'); }
        else { newval = raw_value; }
        if (this.jobj[this.field] !== newval) { this.jobj[this.field] = newval; this.curr_val = newval; }
    }
	reset_value() { this.curr_val = this.jobj[this.field]; this.value_type = typeof this.curr_val; if (this.input_elem) { this.input_elem.value = this.curr_val !== undefined ? this.curr_val : ''; } }
}

/**
 * character_item Class
 */
class character_item {
	constructor(actor, context, skills_ctx) { this.actor = actor; this.ctx = context; this.skills_ctx = skills_ctx; if (!Array.isArray(this.actor._skills)) this.actor._skills = []; this.actor._skills = this.actor._skills.map(id => parseInt(id)).filter(id => !isNaN(id)); this.skill_list_container = null; this.add_skill_select = null; }
    _createSkillListItem(skillId) { const numericSkillId = parseInt(skillId); if (isNaN(numericSkillId)) return null; const skillInfo = this.skills_ctx[numericSkillId]; const skillName = (skillInfo && skillInfo.name) ? skillInfo.name : `Skill ID: ${numericSkillId} (Unknown)`; let listItem = document.createElement('li'); listItem.dataset.skillId = numericSkillId; let nameSpan = document.createElement('span'); nameSpan.textContent = skillName; nameSpan.classList.add('skill-name'); if (!skillInfo || !skillInfo.name) nameSpan.classList.add('skill-missing-name'); let removeButton = document.createElement('button'); removeButton.textContent = 'Remove'; removeButton.classList.add('skill-remove-button'); removeButton.onclick = () => { const index = this.actor._skills.indexOf(numericSkillId); if (index > -1) this.actor._skills.splice(index, 1); listItem.remove(); this._updateAddSkillDropdown(); }; listItem.appendChild(nameSpan); listItem.appendChild(removeButton); return listItem; }
    _updateAddSkillDropdown() { if (!this.add_skill_select || !this.skills_ctx) return; const learned_ids = new Set(this.actor._skills.map(id => parseInt(id))); this.add_skill_select.innerHTML = '<option value="">-- Select Skill to Add --</option>'; const all_skills = Object.entries(this.skills_ctx) .map(([id, data]) => ({ id: parseInt(id), name: data.name || `ID: ${id}` })) .filter(skill => !isNaN(skill.id) && skill.id > 0 && skill.name) .sort((a, b) => a.name.localeCompare(b.name)); all_skills.forEach(skill => { if (!learned_ids.has(skill.id)) { let option = document.createElement('option'); option.value = skill.id; option.textContent = skill.name; this.add_skill_select.appendChild(option); } }); this.add_skill_select.disabled = this.add_skill_select.options.length <= 1; }
	create_DOM() { let parent = document.createElement('div'); parent.classList.add('character-box'); let header = document.createElement('h3'); header.classList.add('character-name'); header.textContent = this.actor._name || 'Unknown Name'; parent.appendChild(header); let statsContainer = document.createElement('div'); statsContainer.classList.add('character-stats-container'); Object.entries(this.ctx.current).forEach(([idx, value]) => { let elem = this._createStatItem(idx, value.name, this.actor[idx]); statsContainer.appendChild(elem.dom); value['elem'] = elem.input; }); this.ctx.static.forEach((value, idx) => { const paramValue = this.actor._paramPlus ? (this.actor._paramPlus[idx] || 0) : 0; let elem = this._createStatItem(`param_${idx}`, value.name, paramValue, true); statsContainer.appendChild(elem.dom); value['elem'] = elem.input; }); parent.appendChild(statsContainer); let skillsSection = document.createElement('div'); skillsSection.classList.add('character-skills-section'); let skillsHeader = document.createElement('h4'); skillsHeader.textContent = 'Skills'; skillsHeader.classList.add('skills-header'); skillsSection.appendChild(skillsHeader); this.skill_list_container = document.createElement('ul'); this.skill_list_container.classList.add('character-skills-list'); skillsSection.appendChild(this.skill_list_container); if (Array.isArray(this.actor._skills) && this.skills_ctx) { this.actor._skills.forEach(skillIdInput => { const skillId = parseInt(skillIdInput); if (!isNaN(skillId)) { let listItem = this._createSkillListItem(skillId); if(listItem) this.skill_list_container.appendChild(listItem); } }); } else if (!this.skills_ctx) { let p=document.createElement('p'); p.textContent='(Could not load skill names)'; p.style.fontStyle='italic'; this.skill_list_container.appendChild(p); } if (this.skills_ctx && Object.keys(this.skills_ctx).length > 0) { let addSkillContainer = document.createElement('div'); addSkillContainer.classList.add('add-skill-container'); this.add_skill_select = document.createElement('select'); this.add_skill_select.classList.add('add-skill-select'); let addSkillButton = document.createElement('button'); addSkillButton.textContent = 'Add Skill'; addSkillButton.classList.add('add-skill-button'); addSkillButton.onclick = () => { const selectedId = parseInt(this.add_skill_select.value); if (!selectedId || isNaN(selectedId)) return; if (!this.actor._skills.includes(selectedId)) { this.actor._skills.push(selectedId); let listItem = this._createSkillListItem(selectedId); if(listItem) this.skill_list_container.appendChild(listItem); } this._updateAddSkillDropdown(); }; addSkillContainer.appendChild(this.add_skill_select); addSkillContainer.appendChild(addSkillButton); skillsSection.appendChild(addSkillContainer); this._updateAddSkillDropdown(); } parent.appendChild(skillsSection); return parent; }
    _createStatItem(key, name, value, isParam = false) { let subvalue = document.createElement('div'); subvalue.classList.add('item'); subvalue.classList.add('character-item'); let label = document.createElement('p'); label.classList.add('label'); label.textContent = name; subvalue.appendChild(label); let input = document.createElement('input'); input.setAttribute('type', 'text'); input.classList.add('value'); input.value = value !== undefined ? value : ''; input.dataset.statKey = key; if (isParam) input.dataset.isParam = 'true'; input.addEventListener('input', () => this.update_value()); input.addEventListener('blur', () => this.update_value()); subvalue.appendChild(input); return { dom: subvalue, input: input }; }
	update_value() { const characterBox = this.skill_list_container?.closest('.character-box'); if (!characterBox) return; const inputs = characterBox.querySelectorAll('input[type="text"].value[data-stat-key]'); inputs.forEach(input => { const key = input.dataset.statKey; const isParam = input.dataset.isParam === 'true'; const rawValue = input.value; const newValue = Number(rawValue); if (isNaN(newValue)) { /* Handled by reset_value */ return; } if (isParam) { const index = parseInt(key.split('_')[1]); if (index >= 0) { if (!this.actor._paramPlus) this.actor._paramPlus = []; while (this.actor._paramPlus.length <= index) this.actor._paramPlus.push(0); this.actor._paramPlus[index] = newValue; } } else { this.actor[key] = newValue; } }); }
	reset_value() { const characterBox = this.skill_list_container?.closest('.character-box'); if (!characterBox) return; const inputs = characterBox.querySelectorAll('input[type="text"].value[data-stat-key]'); inputs.forEach(input => { const key = input.dataset.statKey; const isParam = input.dataset.isParam === 'true'; let originalValue = ''; if (isParam) { const index = parseInt(key.split('_')[1]); if (index >= 0) originalValue = this.actor._paramPlus ? (this.actor._paramPlus[index] || 0) : 0; } else { originalValue = this.actor[key] !== undefined ? this.actor[key] : ''; } input.value = originalValue !== undefined ? originalValue : ''; }); if (this.skill_list_container) { this.skill_list_container.innerHTML = ''; if (Array.isArray(this.actor._skills) && this.skills_ctx) { this.actor._skills.forEach(skillIdInput => { const skillId = parseInt(skillIdInput); if (!isNaN(skillId)) { let listItem = this._createSkillListItem(skillId); if (listItem) this.skill_list_container.appendChild(listItem); } }); } this._updateAddSkillDropdown(); } }
}


/**
 * switch_item Class
 */
class switch_item {
	constructor(owner_array, index, label) {
        this.data_array = owner_array; this.index = index; this.labeltext = label || `Switch ${index}`;
        if (owner_array[index] === undefined || owner_array[index] === null) owner_array[index] = false;
        this.current_value = !!owner_array[index];
        this.checkbox_elem = null;
    }
	create_DOM() {
		let parent = document.createElement('div'); parent.classList.add('item'); parent.classList.add('switch-item');
        const pinInfo = { type: 'switch', id: this.index, name: this.labeltext };
        const pinButton = createPinButton(pinInfo); parent.appendChild(pinButton);
		let label = document.createElement('label'); label.classList.add('label'); label.classList.add('switch-label'); label.textContent = this.labeltext;
		let checkbox = document.createElement('input'); checkbox.setAttribute('type', 'checkbox'); checkbox.classList.add('value'); checkbox.classList.add('switch-checkbox'); checkbox.checked = this.current_value;
        const checkboxId = `switch-${this.index}-${Date.now()}`; checkbox.id = checkboxId; label.htmlFor = checkboxId; this.checkbox_elem = checkbox;
        checkbox.onchange = () => { this.current_value = checkbox.checked; this.data_array[this.index] = this.current_value; };
		parent.appendChild(label); parent.appendChild(checkbox); return parent;
    }
	update_value() { if (this.checkbox_elem && !!this.data_array[this.index] !== this.checkbox_elem.checked) { this.data_array[this.index] = this.checkbox_elem.checked; } }
	reset_value() { this.current_value = !!this.data_array[this.index]; if (this.checkbox_elem) { this.checkbox_elem.checked = this.current_value; } }
}


/**
 * Section Class
 */
class section {
	constructor(name) { this.name = name; this.items = []; this.extras = null; }
	add_item(item) { this.items.push(item); }
	add_extras(extras_arr) { this.extras = extras_arr ? extras_arr.filter(e => e) : []; }
	create_DOM() { let section_div = document.createElement('div'); section_div.classList.add('section'); let header = document.createElement('h2'); header.classList.add('section-header'); header.classList.add('expanded'); header.textContent = this.name; let section_content = document.createElement('div'); section_content.classList.add('section-content'); let initialDisplayStyle = 'grid'; if (this.name === 'Characters') { section_content.classList.add('character-section-content'); initialDisplayStyle = 'grid'; } else if (this.name === 'Switches') { section_content.classList.add('switch-section-content'); initialDisplayStyle = 'grid'; } section_content.style.display = initialDisplayStyle; let extras_div = document.createElement('div'); header.onclick = (event) => { const target = event.target; const headerElement = target.closest('.section-header'); if (!headerElement) return; const isExpanded = headerElement.classList.contains('expanded'); const currentSectionDiv = headerElement.closest('.section'); if (!currentSectionDiv) return; const contentElement = headerElement.nextElementSibling; const extrasElement = contentElement ? contentElement.nextElementSibling : null; headerElement.classList.toggle('expanded', !isExpanded); headerElement.classList.toggle('collapsed', isExpanded); if (contentElement) { let displayStyle = 'grid'; if (this.name === 'Characters') displayStyle = 'grid'; else if (this.name === 'Switches') displayStyle = 'grid'; contentElement.style.display = isExpanded ? 'none' : displayStyle; } if (extrasElement && extrasElement.classList.contains('extras')) { extrasElement.style.display = isExpanded ? 'none' : 'flex'; } }; section_div.appendChild(header); section_div.appendChild(section_content); this.items.forEach((item) => { const itemDOM = item.create_DOM(); if (itemDOM instanceof Node) section_content.appendChild(itemDOM); }); if (this.extras && this.extras.length > 0) { extras_div.classList.add('extras'); extras_div.style.display = header.classList.contains('expanded') ? 'flex' : 'none'; let extras_label = document.createElement('p'); extras_label.classList.add('extras-label'); extras_label.textContent = 'Add to inventory: '; extras_div.appendChild(extras_label); let select_list = document.createElement('select'); select_list.classList.add('extras-select'); this.extras.forEach((extra) => { if (extra && extra.name !== undefined && extra.id !== undefined && extra.obj !== undefined) { let option = document.createElement('option'); option.dataset.context = JSON.stringify(extra); option.value = extra.id; option.text = extra.name; select_list.appendChild(option); } }); extras_div.appendChild(select_list); let btnadd = document.createElement('button'); btnadd.classList.add('extras-button'); btnadd.onclick = (event) => { if (select_list.selectedIndex < 0) return; const selectedOption = select_list.options[select_list.selectedIndex]; let val; try { val = JSON.parse(selectedOption.dataset.context); } catch (e) { return; } if (val && val.obj && val.id !== undefined) { const itemIdStr = String(val.id); if (val.obj.hasOwnProperty(itemIdStr) && Number(val.obj[itemIdStr]) > 0) { val.obj[itemIdStr] = Number(val.obj[itemIdStr]) + 1; const existingItem = this.items.find(itm => String(itm.field) === itemIdStr && itm.jobj === val.obj); if (existingItem) { existingItem.curr_val = val.obj[itemIdStr]; existingItem.reset_value(); } } else { val.obj[itemIdStr] = 1; let existingItem = this.items.find(itm => String(itm.field) === itemIdStr && itm.jobj === val.obj); if (existingItem) { existingItem.curr_val = 1; existingItem.reset_value(); } else { let item = new value_item(val.obj, itemIdStr, val.name, this.name.toLowerCase().slice(0, -1)); this.add_item(item); section_content.appendChild(item.create_DOM()); updatePinButtonStates(); } } } }; btnadd.textContent = 'Add item'; extras_div.appendChild(btnadd); section_div.appendChild(extras_div); } return section_div; }
	update_values() { this.items.forEach(item => item.update_value()); }
	reset_values() { this.items.forEach(item => item.reset_value()); }
}

// --- Helper functions ---
function build_context_map(json_array_str) { let map = {}; if (!json_array_str) return map; try { const arr = JSON.parse(json_array_str); if (Array.isArray(arr) && arr[0] === null) { arr.forEach((item, index) => { if (item) { const id = item.id !== undefined ? item.id : index; if (id !== 0) map[id] = item; } }); } else if (Array.isArray(arr)) { arr.forEach((item, index) => { if (item && item.id !== undefined) map[item.id] = item; else if (item) map[index] = item; }); } else if (typeof arr === 'object' && arr !== null) { map = arr; } } catch (e) { console.error("Failed to parse context JSON string:", json_array_str.substring(0, 100), e); } return map; }
function build_attribute_context() { let ctx = { static: [], current: {} }; ctx.current['_hp'] = { 'name': 'Current HP' }; ctx.current['_mp'] = { 'name': 'Current MP' }; ctx.current['_tp'] = { 'name': 'Current TP' }; ctx.static[0] = { 'name': 'Max HP' }; ctx.static[1] = { 'name': 'Max MP' }; ctx.static[2] = { 'name': 'Attack' }; ctx.static[3] = { 'name': 'Defense' }; ctx.static[4] = { 'name': 'Magic Attack' }; ctx.static[5] = { 'name': 'Magic Defense' }; ctx.static[6] = { 'name': 'Agility' }; ctx.static[7] = { 'name': 'Luck' }; return ctx; }
function load_section(name, json_parent, section_arr, ctx_map, extras) { let section_obj = new section(name); if (json_parent && typeof json_parent === 'object') { Object.entries(json_parent).forEach(entry => { const [id, quantity] = entry; if (quantity !== null && quantity !== undefined) { let item_name = String(id); if (ctx_map[id] && ctx_map[id].name) { item_name = ctx_map[id].name; } const itemType = name.toLowerCase().slice(0,-1); section_obj.add_item(new value_item(json_parent, id, item_name, itemType)); } }); } if (extras && extras.length > 0) { section_obj.add_extras(extras); } if (section_obj.items.length > 0 || (section_obj.extras && section_obj.extras.length > 0)) { section_arr.push(section_obj); } }
function load_array_section(name, json_parent_array, section_arr, ctx_array) { let section_obj = new section(name); if (Array.isArray(json_parent_array) && json_parent_array.length > 0) { json_parent_array.forEach((value, idx) => { if (idx > 0 && value !== null && value !== undefined) { let var_name = `${name.slice(0,-1)} ${idx}`; if (ctx_array && idx < ctx_array.length && ctx_array[idx]) { var_name = ctx_array[idx]; } section_obj.add_item(new value_item(json_parent_array, idx, var_name, 'variable')); } }); } if (section_obj.items.length > 0) { section_arr.push(section_obj); } }
function load_extra_items(item_obj, item_ctx_map) { let extra_items = []; Object.entries(item_ctx_map).forEach(([itemId, item]) => { const idNum = parseInt(itemId); if (item && item.name && item.name.length > 0 && !item.name.startsWith('-')) { const current_qty = item_obj[idNum]; if (!item_obj.hasOwnProperty(idNum) || current_qty === null || current_qty === undefined || Number(current_qty) <= 0) { extra_items.push({ 'name': item.name, 'id': idNum, 'obj': item_obj }); } } }); extra_items.sort((a, b) => a.name.localeCompare(b.name)); return extra_items; }
function get_rm_arr(obj, field) { if (!obj || typeof obj !== 'object') return null; let p = obj[field]; if (!p) return null; if (Array.isArray(p)) return p; if (typeof p === 'object' && p !== null && p.hasOwnProperty('@a')) { let a = p['@a']; if (Array.isArray(a)) return a; } return null; }
function inventory_section(name, json_obj, context_str, sections) { let ctx_map = build_context_map(context_str); let item_extras = null; if (!json_obj || typeof json_obj !== 'object') { json_obj = {}; } item_extras = load_extra_items(json_obj, ctx_map); load_section(name, json_obj, sections, ctx_map, item_extras); }


/**
 * Build the sections for the editor.
 */
function build_sections(json, context) {
	let sections = [];
	const items_map = build_context_map(context['items']); const weapons_map = build_context_map(context['weapons']); const armors_map = build_context_map(context['armors']); const skills_map = build_context_map(context['skills']); let variable_names = []; let switch_names = []; if (context['variables']) { try { const sys = JSON.parse(context['variables']); if (sys) { if (Array.isArray(sys.variables)) variable_names = sys.variables; if (Array.isArray(sys.switches)) switch_names = sys.switches; } } catch (e) {} } if (!json || typeof json !== 'object') return sections;
	let common = new section('Common'); if (json.party && typeof json.party === 'object') { if (json.party.hasOwnProperty('_gold')) common.add_item(new value_item(json.party, '_gold', 'Gold', 'value')); if (json.party.hasOwnProperty('_steps')) common.add_item(new value_item(json.party, '_steps', 'Steps', 'value')); } if (common.items.length > 0) sections.push(common);
    if (json.party && json.actors) { let party_section = new section('Characters'); const p_actors = get_rm_arr(json.party, '_actors'); const a_actors = get_rm_arr(json.actors, '_data'); if (p_actors && a_actors) { p_actors.forEach(idx_str => { const idx = parseInt(idx_str); if (idx > 0 && idx < a_actors.length && a_actors[idx]) { const actor = a_actors[idx]; if (actor && typeof actor === 'object') { party_section.add_item(new character_item(actor, build_attribute_context(), skills_map)); } } }); } if (party_section.items.length > 0) sections.push(party_section); inventory_section('Items', json.party?._items, context['items'], sections); inventory_section('Weapons', json.party?._weapons, context['weapons'], sections); inventory_section('Armor', json.party?._armors, context['armors'], sections); }
	if (json.variables) { const data = get_rm_arr(json.variables, '_data'); if (data) load_array_section('Variables', data, sections, variable_names); }
    if (json.switches) { const data = get_rm_arr(json.switches, '_data'); if (data) { let sect = new section('Switches'); if (Array.isArray(data)) { while(data.length < switch_names.length) data.push(null); data.forEach((val, idx) => { if (idx > 0) { let name = `Switch ${idx}`; if (idx < switch_names.length && switch_names[idx]) name = switch_names[idx]; const boolVal = val === null || val === undefined ? false : !!val; if (data[idx] !== boolVal) data[idx] = boolVal; sect.add_item(new switch_item(data, idx, name)); } }); } if (sect.items.length > 0) sections.push(sect); } }
	return sections;
}


/**
 * Builds the floating control palette.
 */
function build_palette(sections, fdata) { let palette = document.getElementById('palette'); palette.innerHTML = ''; const baseFilename = fdata['filename'] || 'current file'; let savebtn = document.createElement('button'); savebtn.textContent = 'Overwrite ' + baseFilename; savebtn.classList.add('palette-button'); savebtn.title = `Save changes back to ${fdata['savefile']}`; savebtn.onclick = (event) => { handle_save(fdata['savefile'], fdata['object'], fdata['rm_root'], window.currentFileSections); }; let saveasbtn = document.createElement('button'); saveasbtn.textContent = 'Save as...'; saveasbtn.classList.add('palette-button'); saveasbtn.title = 'Save changes to a new file location'; saveasbtn.onclick = (event) => { handle_save('', fdata['object'], fdata['rm_root'], window.currentFileSections); }; let jdumpbtn = document.createElement('button'); jdumpbtn.textContent = 'Dump raw JSON'; jdumpbtn.classList.add('palette-button'); jdumpbtn.title = 'Save the current state as a raw JSON file'; jdumpbtn.onclick = (event) => { handle_save(null, fdata.object, fdata.rm_root, sections); /* Call handle_save to sync pinned before dump */ dump_json(JSON.stringify(fdata['object'], null, 2), fdata['rm_root']); }; let resetbtn = document.createElement('button'); resetbtn.textContent = 'Revert all changes'; resetbtn.classList.add('palette-button'); resetbtn.title = 'Undo all edits made since loading the file'; resetbtn.onclick = (event) => { if (confirm('Are you sure you want to revert all changes made in the editor?\n(This will reset fields and added/removed skills/items in the editor, but will not reload the file.)')) { window.currentFileSections.forEach((section) => section.reset_values()); updatePinnedItemsDisplay(); updatePinButtonStates(); set_text('status', 'Reverted changes in the editor.'); } }; palette.appendChild(savebtn); palette.appendChild(saveasbtn); palette.appendChild(jdumpbtn); palette.appendChild(resetbtn); }

function dump_json(json_str, rm_root) { window.ipc_bridge.dump_json(json_str, rm_root, (status) => { if (status && status.length > 0) set_text('status', 'Dumped raw JSON to ' + status); else set_text('status', 'JSON dump cancelled or failed.'); }); }

// Updated handle_save to sync pinned items explicitly
function handle_save(outfile_path, json_obj, rm_root, sections) {
    const isSaveAs = !outfile_path || outfile_path.length === 0;
    let filename_for_status = 'new file';
    if (!isSaveAs) {
        const lastSlash = outfile_path.lastIndexOf('/');
        const lastBackslash = outfile_path.lastIndexOf('\\');
        const lastSeparator = Math.max(lastSlash, lastBackslash);
        filename_for_status = lastSeparator > -1 ? outfile_path.substring(lastSeparator + 1) : outfile_path;
    }
    set_text('status', `Saving ${filename_for_status}...`);

    // 1. Update values from the main sections
    sections.forEach((section) => section.update_values());

    // 2. Explicitly update json_obj from PINNED items DOM state
    const pinnedContentDiv = document.getElementById('pinned-items-content');
    if (pinnedContentDiv) {
        console.log("Performing final update from pinned items before save...");
        const pinnedItemsElements = pinnedContentDiv.querySelectorAll('.item');

        pinnedItemsElements.forEach(itemElement => {
            const pinButton = itemElement.querySelector('.pin-button');
            const inputElement = itemElement.querySelector('input.value'); // Text input
            const checkboxElement = itemElement.querySelector('input.switch-checkbox'); // Checkbox

            if (!pinButton) return;

            const itemType = pinButton.dataset.itemType;
            const itemId = pinButton.dataset.itemId;

            try {
                switch(itemType) {
                    case 'variable':
                        if (inputElement && json_obj.variables) {
                            const varArray = get_rm_arr(json_obj.variables, '_data'); const index = parseInt(itemId);
                            if (varArray && index > 0 && index < varArray.length) {
                                const originalType = typeof varArray[index]; let newValue = inputElement.value;
                                if (originalType === 'number') { newValue = Number(newValue); if (isNaN(newValue)) throw new Error(`Invalid number for variable ${index}`); }
                                else if (originalType === 'boolean') { newValue = newValue.toLowerCase() === 'true' || (newValue !== '' && newValue.toLowerCase() !== 'false' && newValue !== '0'); }
                                if (varArray[index] !== newValue) varArray[index] = newValue;
                            }
                        } break;
                    case 'switch':
                        if (checkboxElement && json_obj.switches) {
                             const switchArray = get_rm_arr(json_obj.switches, '_data'); const index = parseInt(itemId);
                             if (switchArray && index > 0 && index < switchArray.length) {
                                 const newValue = checkboxElement.checked; if (!!switchArray[index] !== newValue) switchArray[index] = newValue;
                             }
                        } break;
                    case 'item': case 'weapon': case 'armor':
                         if (inputElement && json_obj.party) {
                             const inventoryMap = json_obj.party[`_${itemType}s`];
                             if (inventoryMap && inventoryMap.hasOwnProperty(itemId)) {
                                 let newValue = inputElement.value; newValue = Number(newValue);
                                 if (isNaN(newValue)) throw new Error(`Invalid number for ${itemType} ${itemId}`);
                                 newValue = Math.max(0, newValue);
                                 if (inventoryMap[itemId] !== newValue) inventoryMap[itemId] = newValue;
                             }
                         } break;
                }
            } catch (error) { console.error(`Error during final pinned update for ${itemType} ${itemId}:`, error); }
        });
    }

    // 3. Stringify the fully updated json_obj
    const json_string_to_save = JSON.stringify(json_obj);

    // 4. Call backend to save
    window.ipc_bridge.save_file(outfile_path, json_string_to_save, rm_root, (saved_path) => {
        if (saved_path && saved_path.length > 0) {
            set_text('status', `Saved ${saved_path}`);
            if (isSaveAs && window.currentFileData) {
                window.currentFileData.savefile = saved_path;
                window.currentFileData.filename = saved_path.substring(Math.max(saved_path.lastIndexOf('/'), saved_path.lastIndexOf('\\')) + 1);
                build_palette(window.currentFileSections, window.currentFileData);
                updatePinButtonStates();
            }
        } else { set_text('status', `Error saving ${filename_for_status}`); }
    });
}


/**
 * Parses loaded data, builds sections, creates DOM.
 */
function handle_file_load(filename, context_obj) {
	set_text('status', 'Handling file load for ' + filename);
	if (!context_obj || !context_obj['json_txt']) { console.error('File load failed or missing JSON context for ' + filename); set_text('status', 'Error loading file: ' + filename); hide_dropzone(); return; }
    window.currentFileData = {}; let fdata = window.currentFileData;
	let json_txt = context_obj['json_txt']; fdata['filename'] = filename; fdata['savefile'] = context_obj['savefile']; fdata['rm_root'] = context_obj['rm_root'];
	const content_div = document.getElementById('content'); const palette_div = document.getElementById('palette'); const pinnedContentDiv = document.getElementById('pinned-items-content'); const pinnedSectionDiv = document.getElementById('pinned-items-section');
    content_div.innerHTML = ''; palette_div.innerHTML = ''; if (pinnedContentDiv) pinnedContentDiv.innerHTML = ''; if (pinnedSectionDiv) pinnedSectionDiv.classList.add('section-hidden');
	try { fdata['object'] = JSON.parse(json_txt); } catch (e) { console.error('Failed to parse save file JSON:', e); set_text('status', `Error: Could not parse JSON in ${filename}.`); hide_dropzone(); return; }
    loadPinsFromStorage();
    window.currentFileSections = build_sections(fdata['object'], context_obj); let sections = window.currentFileSections;
	sections.forEach((section) => { try { content_div.appendChild(section.create_DOM()); } catch(domError) { console.error(`Error creating DOM for section "${section.name}":`, domError); } });
    updatePinnedItemsDisplay(); updatePinButtonStates();
	build_palette(sections, fdata); hide_dropzone(); set_text('status', 'Loaded ' + filename);
}

function show_dropzone() { const dz = document.getElementById('receive_file'); dz.classList.remove('dropzone-hidden'); document.getElementById('content').innerHTML = ''; document.getElementById('palette').innerHTML = ''; const pinnedContent = document.getElementById('pinned-items-content'); if (pinnedContent) pinnedContent.innerHTML = ''; document.getElementById('pinned-items-section')?.classList.add('section-hidden'); set_text('status', 'Ready for file.'); }
function hide_dropzone() { const dz = document.getElementById('receive_file'); dz.classList.add('dropzone-hidden'); }
function drop_handler(ev) { console.log('File(s) dropped'); ev.preventDefault(); let fileToLoad = null; if (ev.dataTransfer.items) { if (ev.dataTransfer.items.length > 0 && ev.dataTransfer.items[0].kind === 'file') { fileToLoad = ev.dataTransfer.items[0].getAsFile(); } } else if (ev.dataTransfer.files.length > 0) { fileToLoad = ev.dataTransfer.files[0]; } if (fileToLoad && fileToLoad.path) { set_text('status', 'Loading dropped file: ' + fileToLoad.name); window.ipc_bridge.load_file(fileToLoad.path, handle_file_load); } else if (fileToLoad) { set_text('status', 'Error: Could not get path from dropped file.'); } else { set_text('status', 'Drop contained no usable files.'); } if (ev.dataTransfer.items) ev.dataTransfer.items.clear(); else ev.dataTransfer.clearData(); }
function drag_handler(ev) { ev.preventDefault(); ev.stopPropagation(); }
function click_handler(ev) { console.log('Dropzone clicked'); set_text('status', 'Opening file dialog...'); window.ipc_bridge.open_file(handle_file_load); }


window.addEventListener('DOMContentLoaded', (event) => {
	let dropzone = document.getElementById('receive_file'); dropzone.addEventListener('drop', drop_handler); dropzone.addEventListener('dragover', drag_handler); dropzone.addEventListener('click', click_handler);
	const version = window.ipc_bridge.version(); let footer = document.getElementById('footer'); footer.textContent = 'RPGMaker Save Editor v' + version;
    loadPinsFromStorage(); updatePinnedItemsDisplay(); set_text('status', 'Ready for file.');
});