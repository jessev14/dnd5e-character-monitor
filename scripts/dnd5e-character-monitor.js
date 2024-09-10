const moduleID = 'dnd5e-character-monitor';
let socket;

const lg = x => console.log(x);


Hooks.once('init', async () => {
    game.settings.registerMenu(moduleID, 'cmColorsMenu', {
        name: game.i18n.localize('characterMonitor.settings.cmColorsMenu.name'),
        label: game.i18n.localize('characterMonitor.settings.cmColorsMenu.label'),
        icon: 'fas fa-palette',
        type: CharacterMonitorColorMenu,
        restricted: true
    });
    game.settings.register(moduleID, 'cmColors', {
        name: 'Character Monitor Colors',
        hint: '',
        scope: 'world',
        type: Object,
        default: {
            hpPlus: '#06a406',
            hpMinus: '#c50d19',
            on: '#06a406',
            off: '#c50d19',
            slots: '#b042f5',
            feats: '#425af5',
            effects: '#c86400',
            currency: '#b59b3c',
            proficiency: '#37908a',
            ability: '#37908a',
            sheetMode: '#000000'
        },
        config: false,
        onChange: setCSSvariables
    });

    const monitorTypes = [
        'HP',
        'Equip',
        'Quantity',
        'Attune',
        'SpellPrep',
        'SpellSlots',
        'Feats',
        'Currency',
        'Proficiency',
        'SheetMode'
    ];

    for (const monitorType of monitorTypes) {
        game.settings.register(moduleID, `monitor${monitorType}`, {
            name: game.i18n.localize(`characterMonitor.settings.monitor${monitorType}.name`),
            hint: game.i18n.localize(`characterMonitor.settings.monitor${monitorType}.hint`),
            scope: 'world',
            type: Boolean,
            default: true,
            config: true
        });
    }

    game.settings.register(moduleID, 'showGMonly', {
        name: game.i18n.localize('characterMonitor.settings.showGMonly.name'),
        hint: game.i18n.localize('characterMonitor.settings.showGMonly.hint'),
        scope: 'world',
        type: Boolean,
        default: false,
        config: true
        // onChange: debounce(CharacterMonitor.setCssVariables, 500)
    });

    // game.settings.register(moduleID, 'allowPlayerView', {
    //     name: game.i18n.localize('characterMonitor.settings.allowPlayerView.name'),
    //     hint: game.i18n.localize('characterMonitor.settings.allowPlayerView.hint'),
    //     scope: 'world',
    //     type: Boolean,
    //     default: false,
    //     config: true
    //     // onChange: debounce(CharacterMonitor.setCssVariables, 500)
    // });

    game.settings.register(moduleID, 'showToggle', {
        name: game.i18n.localize('characterMonitor.settings.showToggle.name'),
        hint: game.i18n.localize('characterMonitor.settings.showToggle.hint'),
        scope: 'world',
        type: Boolean,
        default: false,
        config: true,
        onChange: async () => {
            if (!game.user.isGM) return;

            await game.settings.set(moduleID, 'cmToggle', true);
            setTimeout(() => window.location.reload(), 500);
        }
    });

    game.settings.register(moduleID, 'showPrevious', {
        name: 'Show Previous Values',
        hint: '',
        scope: 'world',
        type: Boolean,
        default: false,
        config: true

    });

    game.settings.register(moduleID, 'cmToggle', {
        name: 'Toggle Character Monitor',
        hint: '',
        scope: 'world',
        type: Boolean,
        default: true,
        config: false
    });

    game.settings.register(moduleID, 'useTokenName', {
        name: game.i18n.localize('characterMonitor.settings.useTokenName.name'),
        hint: game.i18n.localize('characterMonitor.settings.useTokenName.hint'),
        scope: 'world',
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register(moduleID, 'hideNPCs', {
        name: game.i18n.localize('characterMonitor.settings.hideNPCs.name'),
        hint: game.i18n.localize('characterMonitor.settings.hideNPCs.hint'),
        scope: 'world',
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register(moduleID, 'hideNPCname', {
        name: game.i18n.localize('characterMonitor.settings.hideNPCname.name'),
        hint: game.i18n.localize('characterMonitor.settings.hideNPCname.hint'),
        scope: 'world',
        type: Boolean,
        default: false,
        config: true
    });

    game.settings.register(moduleID, 'replacementName', {
        name: game.i18n.localize('characterMonitor.settings.replacementName.name'),
        hint: game.i18n.localize('characterMonitor.settings.replacementName.hint'),
        scope: 'world',
        type: String,
        default: '???',
        config: true
    });

    const templateDir = `modules/${moduleID}/templates`;
    await loadTemplates([
        `${templateDir}/hp.hbs`,
        `${templateDir}/itemEquip.hbs`,
        `${templateDir}/itemQuantity.hbs`,
        `${templateDir}/itemAttune.hbs`,
        `${templateDir}/spellPrepare.hbs`,
        `${templateDir}/featUses.hbs`,
        `${templateDir}/spellSlots.hbs`,
        `${templateDir}/currency.hbs`,
        `${templateDir}/proficiency.hbs`,
        `${templateDir}/ability.hbs`,
        `${templateDir}/effectEnabled.hbs`,
        `${templateDir}/effectDuration.hbs`,
        `${templateDir}/effectEffects.hbs`,
        `${templateDir}/toggleSheetMode.hbs`
    ]);

    libWrapper.register(moduleID, 'game.dnd5e.applications.actor.ActorSheet5eCharacter2.prototype._onChangeSheetMode', toggleSheetMode, 'WRAPPER');
});

Hooks.once('setup', async () => {
    if (game.settings.get(moduleID, 'showToggle')) {
        Hooks.on('getSceneControlButtons', controls => {
            const bar = controls.find(c => c.name === 'token');
            bar.tools.push({
                name: 'Character Monitor',
                title: game.i18n.localize('characterMonitor.control.title'),
                icon: 'fas fa-exchange-alt',
                visible: game.user.isGM,
                toggle: true,
                active: game.settings.get(moduleID, 'cmToggle'),
                onClick: async toggled => await game.settings.set(moduleID, 'cmToggle', toggled)
            });
        });
    }

    setCSSvariables();
});

Hooks.once('socketlib.ready', () => {
    socket = socketlib.registerModule(moduleID);
    console.log(socket)
    socket.register('createMessage', createMessage);
});


Hooks.on('renderChatMessage', (app, [html], appData) => {
    if (!appData.message.flags[moduleID] || !html) return;

    const message = game.messages.get(appData.message._id);
    const monitorType = message.getFlag(moduleID, 'monitorType');
    if (monitorType) {
        html.classList.add('dnd5e-cm', `dnd5e-cm-${monitorType}`);
        html.querySelector('header').style.display = 'none';
    }
});

Hooks.on('preUpdateActor', async (actor, diff, options, userID) => {
    if (actor.type !== 'character') return;
    if (game.system.id === 'dnd5e' && "isAdvancement" in options) return;
    if (game.settings.get(moduleID, 'showToggle') && !game.settings.get(moduleID, 'cmToggle')) return;

    const whisper = game.settings.get(moduleID, 'showGMonly')
        ? game.users.filter(u => u.isGM).map(u => u.id)
        : [];

    const templateData = {
        characterName: game.settings.get(moduleID, 'useTokenName') ? (actor.token?.name || actor.prototypeToken.name) : actor.name
    };

    if (game.settings.get(moduleID, 'monitorSpellSlots') && ('spells' in (diff.system || {}))) {
        for (const [spellLevel, newSpellData] of Object.entries(diff.system.spells)) {
            const oldSpellData = actor.system.spells[spellLevel];
            const hasValue = ("value" in newSpellData);
            const hasMax = ("override" in newSpellData) || ("max" in newSpellData);
            if (!hasValue && !hasMax) continue;

            const newMax = newSpellData.override ?? newSpellData.max;

            const isValueUnchanged = (!hasValue || (!newSpellData.value && !oldSpellData.value));
            const isMaxUnchanged = (!hasMax || (!newMax && !oldSpellData.max));
            if (isValueUnchanged && isMaxUnchanged) continue;

            const levelNum = parseInt(spellLevel.slice(-1));
            templateData.spellSlot = {
                label: CONFIG.DND5E.spellLevels[levelNum],
                value: (hasValue ? newSpellData.value : oldSpellData.value) || 0,
                max: (newMax ?? oldSpellData.max) || 0
            }
            if (game.settings.get(moduleID, 'showPrevious')) templateData.spellSlot.old = oldSpellData.value;
            const content = await renderTemplate(`modules/${moduleID}/templates/spellSlots.hbs`, templateData);
            const flags = {
                [moduleID]: {
                    monitorType: 'slots'
                }
            };
            await socket.executeAsGM('createMessage', flags, content, whisper);
        }
    }

    if (game.settings.get(moduleID, 'monitorCurrency') && ('currency' in (diff.system || {}))) {
        for (const [currency, newValue] of Object.entries(diff.system.currency)) {
            const oldValue = actor.system.currency[currency];

            // Ignore any updates that attempt to change values between zero <--> null.;
            if (newValue === null || newValue == oldValue) continue;

            templateData.currency = {
                label: currency,
                value: newValue
            };
            if (game.settings.get(moduleID, 'showPrevious')) templateData.currency.old = oldValue;
            const content = await renderTemplate(`modules/${moduleID}/templates/currency.hbs`, templateData);
            const flags = {
                [moduleID]: {
                    monitorType: 'currency'
                }
            };
            await socket.executeAsGM('createMessage', flags, content, whisper);
        }
    }

    if (game.settings.get(moduleID, 'monitorProficiency') && ('skills' in (diff.system || {}))) {
        for (const [skl, changes] of Object.entries(diff.system.skills)) {
            if (!('value' in changes)) continue;
            if (typeof changes.value !== 'number') continue;

            templateData.proficiency = {
                label: CONFIG.DND5E.skills[skl].label,
                value: CONFIG.DND5E.proficiencyLevels[changes.value]
            };
            const oldValue = actor.system.skills[skl].value;
            if (oldValue === changes.value) continue;

            const content = await renderTemplate(`modules/${moduleID}/templates/proficiency.hbs`, templateData);
            const flags = {
                [moduleID]: {
                    monitorType: 'proficiency'
                }
            };
            await socket.executeAsGM('createMessage', flags, content, whisper);
        }
    }
});

Hooks.on('updateActor', async (actor, diff, options, userID) => {
    if (!game.settings.get(moduleID, 'monitorHP')) return;
    if (game.settings.get(moduleID, 'showToggle') && !game.settings.get(moduleID, 'cmToggle')) return;

    if (diff.system?.attributes?.hp) {
        const previousData = options.dnd5e.hp
        let characterName = game.settings.get(moduleID, 'useTokenName') ? (actor.token?.name || actor.prototypeToken.name) : actor.name;
        if (actor.type === 'npc' && game.settings.get(moduleID, 'hideNPCname')) characterName = game.settings.get(moduleID, 'replacementName') ?? '???';
        const data = {
            previous: game.settings.get(moduleID, 'showPrevious'),
            characterName
        };

        for (const healthType of ['value', 'max', 'temp']) {
            const value = actor.system.attributes.hp[healthType];
            const previousValue = previousData[healthType];
            const delta = value - previousValue;
            if (delta) {
                const direction = delta > 0 ? 'Plus' : 'Minus';
                const flags = {
                    [moduleID]: {
                        monitorType: `hp${direction}`
                    }
                };
                data.type = game.i18n.localize(`characterMonitor.chatMessage.hp.${healthType}`, flags);
                data.direction = direction;
                data.value = value;
                data.previousValue = previousValue;
                const content = await renderTemplate(`modules/${moduleID}/templates/hp.hbs`, data);
                const whisper = game.settings.get(moduleID, 'showGMonly') || (game.settings.get(moduleID, 'hideNPCs') && actor.type === 'npc')
                    ? game.users.filter(u => u.isGM).map(u => u.id)
                    : [];
                if (game.user.id === userID) await socket.executeAsGM('createMessage', flags, content, whisper);
            }
        }
    }
});

Hooks.on('preUpdateItem', async (item, diff, options, userID) => {
    if (game.settings.get(moduleID, 'cmToggle') && !game.settings.get(moduleID, 'cmToggle')) return;
    if (item.parent?.type !== 'character') return;

    const actor = item.parent;

    const monitoredChangesDict = {};
    for (const monitor of ['monitorEquip', 'monitorQuantity', 'monitorSpellPrep', 'monitorFeats', 'monitorAttune']) {
        monitoredChangesDict[monitor] = game.settings.get(moduleID, monitor);
    }

    const isEquip = monitoredChangesDict['monitorEquip'] && (item.type === 'equipment' || item.type === 'weapon') && 'equipped' in (diff.system || {});
    const isQuantity = monitoredChangesDict['monitorQuantity'] && 'quantity' in (diff.system || {});
    const isSpellPrep = monitoredChangesDict['monitorSpellPrep'] && item.type === 'spell' && 'prepared' in (diff?.system?.preparation || {});
    const isFeat = monitoredChangesDict['monitorFeats'] && item.type === 'feat' && ('value' in (diff?.system?.uses || {}) || 'max' in (diff?.system?.uses || {}));
    const isAttune = monitoredChangesDict['monitorAttune'] && (item.type === 'equipment' || item.type === 'weapon') && 'attuned' in (diff.system || {});

    if (!(isEquip || isQuantity || isSpellPrep || isFeat || isAttune)) return;

    const whisper = game.settings.get(moduleID, 'showGMonly')
        ? game.users.filter(u => item.parent.testUserPermission(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)).map(u => u.id)
        : null;

    const characterName = game.settings.get(moduleID, 'useTokenName') ? (actor.token?.name || actor.prototypeToken.name) : actor.name;
    const templateData = {
        characterName,
        itemName: item.name,
        showPrevious: game.settings.get(moduleID, 'showPrevious')
    };

    if (isEquip) {
        templateData.equipped = diff.system.equipped;
        const content = await renderTemplate(`modules/${moduleID}/templates/itemEquip.hbs`, templateData);
        const flags = {
            [moduleID]: {
                monitorType: `${templateData.equipped ? 'on' : 'off'}`
            }
        };
        await socket.executeAsGM('createMessage', flags, content, whisper);
    }

    if (isQuantity) {
        const oldQuantity = item.system.quantity;
        const newQuantity = diff.system.quantity;
        templateData.quantity = {
            old: oldQuantity,
            value: newQuantity
        };
        const content = await renderTemplate(`modules/${moduleID}/templates/itemQuantity.hbs`, templateData);
        const flags = {
            [moduleID]: {
                monitorType: `${newQuantity > oldQuantity ? 'on' : 'off'}`
            }
        };
        await socket.executeAsGM('createMessage', flags, content, whisper);
    }

    if (isSpellPrep) {
        templateData.prepared = diff.system.preparation.prepared;
        const content = await renderTemplate(`modules/${moduleID}/templates/spellPrepare.hbs`, templateData);
        const flags = {
            [moduleID]: {
                monitorType: `${templateData.prepared ? 'on' : 'off'}`
            }
        };
        await socket.executeAsGM('createMessage', flags, content, whisper);
    }

    if (isFeat) {
        const newUses = diff.system.uses;
        const oldUses = item.system.uses;
        const hasValue = ("value" in newUses);
        const hasMax = ("max" in newUses);
        if (!hasValue && !hasMax) return;

        const isValueUnchanged = (!hasValue || (!newUses.value && !oldUses.value));
        const isMaxUnchanged = (!hasMax || (!newUses.max && !oldUses.max));
        if (isValueUnchanged && isMaxUnchanged) return;

        templateData.uses = {
            value: (hasValue ? newUses.value : oldUses.value) || 0,
            max: (hasMax ? newUses.max : oldUses.max) || 0
        };
        const content = await renderTemplate(`modules/${moduleID}/templates/featUses.hbs`, templateData);
        const flags = {
            [moduleID]: {
                monitorType: 'feats'
            }
        };
        await socket.executeAsGM('createMessage', flags, content, whisper);
    }

    if (isAttune) {
        templateData.attuned = diff.system.attuned;
        const content = await renderTemplate(`modules/${moduleID}/templates/itemAttune.hbs`, templateData);
        const flags = {
            [moduleID]: {
                monitorType: `${templateData.attuned ? 'on' : 'off'}`
            }
        };
        await socket.executeAsGM('createMessage', flags, content, whisper);
    }
});


function createMessage(flags, content, whisper) {
    return ChatMessage.create({ flags, content, whisper });
}

function setCSSvariables() {
    const root = document.querySelector(':root');
    const colors = game.settings.get(moduleID, 'cmColors');
    for (const [monitorType, color] of Object.entries(colors)) {
        root.style.setProperty(`--dnd5e-cm-${monitorType}`, color);
    }

    const showGmOnly = game.settings.get(moduleID, 'showGMonly');
    // const allowPlayerView = game.settings.get(moduleID, 'allowPlayerView');

    const display = ((showGmOnly && !game.user.isGM && !allowPlayerView) ? 'none' : 'flex');
    // root.style.setProperty('--dnd5e-cm-display', display);
}

async function toggleSheetMode(wrapped, event) {
    await wrapped(event);
    if (!game.settings.get(moduleID, 'monitorSheetMode')) return;

    const flags = {
        [moduleID]: {
            monitorType: 'sheetMode'
        }
    };

    const actor = this.actor
    const templateData = {
        characterName: game.settings.get(moduleID, 'useTokenName') ? (actor.token?.name || actor.prototypeToken.name) : actor.name,
        sheetMode: this._mode === 1 ? game.i18n.localize('DND5E.SheetModePlay') : game.i18n.localize('DND5E.SheetModeEdit')
    };
    const content = await renderTemplate(`modules/${moduleID}/templates/toggleSheetMode.hbs`, templateData);

    const whisper = game.settings.get(moduleID, 'showGMonly')
        ? game.users.filter(u => u.isGM).map(u => u.id)
        : [];

    await socket.executeAsGM('createMessage', flags, content, whisper);
}


class CharacterMonitorColorMenu extends FormApplication {

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: 'Customize Character Monitor Colors',
            template: `/modules/${moduleID}/templates/colorMenu.hbs`,
            width: 700
        }
    }

    getData() {
        const settingsData = game.settings.get(moduleID, 'cmColors');
        const data = {
            hpPlus: {
                color: settingsData.hpPlus,
                label: game.i18n.localize('characterMonitor.colorMenu.hpPlus')
            },
            hpMinus: {
                color: settingsData.hpMinus,
                label: game.i18n.localize('characterMonitor.colorMenu.hpMinus')
            },
            on: {
                color: settingsData.on,
                label: game.i18n.localize('characterMonitor.colorMenu.on')
            },
            off: {
                color: settingsData.off,
                label: game.i18n.localize('characterMonitor.colorMenu.off')
            },
            slots: {
                color: settingsData.slots,
                label: game.i18n.localize('characterMonitor.chatMessage.SpellSlots')
            },
            feats: {
                color: settingsData.feats,
                label: game.i18n.localize('DND5E.Features')
            },
            currency: {
                color: settingsData.currency,
                label: game.i18n.localize('DND5E.Currency')
            },
            proficiency: {
                color: settingsData.proficiency,
                label: game.i18n.localize('DND5E.Proficiency')
            },
            sheetMode: {
                color: settingsData.sheetMode,
                label: game.i18n.localize('characterMonitor.chatMessage.sheetMode')
            }
        };

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.on('click', `button[name='reset']`, () => {
            html.find(`input[name='hpPlus']`).val('#06a406');
            html.find(`input[data-edit='hpPlus']`).val('#06a406');
            html.find(`input[name='hpMinus']`).val('#c50d19');
            html.find(`input[data-edit='hpMinus']`).val('#c50d19');
            html.find(`input[name='on']`).val('#06a406');
            html.find(`input[data-edit='on']`).val('#06a406');
            html.find(`input[name='off']`).val('#c50d19');
            html.find(`input[data-edit='off']`).val('#c50d19');
            html.find(`input[name='slots']`).val('#b042f5');
            html.find(`input[data-edit='slots']`).val('#b042f5');
            html.find(`input[name='feats']`).val('#425af5');
            html.find(`input[data-edit='feats']`).val('#425af5');
            html.find(`input[name='effects']`).val('#c86400');
            html.find(`input[data-edit='effects']`).val('#c86400');
            html.find(`input[name='currency']`).val('#b59b3c');
            html.find(`input[data-edit='currency']`).val('#b59b3c');
            html.find(`input[name='proficiency']`).val('#37908a');
            html.find(`input[data-edit='proficiency']`).val('#37908a');
            html.find(`input[name='ability']`).val('#37908a');
            html.find(`input[data-edit='ability']`).val('#37908a');
            html.find(`input[name='sheetMode']`).val('#000000');
            html.find(`input[data-edit='sheetMode']`).val('#000000');
        });
    }

    async _updateObject(event, formData) {
        await game.settings.set(moduleID, 'cmColors', formData);
    }
}
