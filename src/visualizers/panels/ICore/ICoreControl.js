/*globals define, WebGMEGlobal, $*/
/*jshint browser: true*/
/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Wed Nov 30 2016 10:36:41 GMT-0600 (Central Standard Time).
 */

define([
    'js/Constants',
    './ICorePluginEvaluator',
    'js/Toolbar/ToolbarDropDownButton',
    'js/Utils/ComponentSettings',
    'js/Dialogs/PluginResults/PluginResultsDialog',
    'plugin/PluginResult',
    'js/Loader/LoaderCircles'
], function (CONSTANTS,
             ICorePluginEvaluator,
             ToolbarDropDownButton,
             ComponentSettings,
             PluginResultsDialog,
             PluginResult,
             LoaderCircles) {

    'use strict';

    var YOUTUBE_VIDEO_URL = 'https://youtu.be/gDvLnR0iDJQ';

    function overrideNotificationFunction(data) {
        var notification = {
            severity: data.notification.severity || 'info',
            message: '[Plugin] ' + data.pluginName + ' - ' + data.notification.message
        };

        if (typeof data.notification.progress === 'number') {
            notification.message += ' [' + data.notification.progress + '%]';
        }

        if (data.pluginName !== 'PyCoreExecutor') {
            this.dispatchEvent(this.CONSTANTS.NOTIFICATION, notification);
        }

        this.dispatchEvent(this.CONSTANTS.PLUGIN_NOTIFICATION, data);
    }

    /**
     * @param {object} options
     * @class
     * @augments {ICorePluginEvaluator}
     * @constructor
     */
    function ICoreControl(options) {
        ICorePluginEvaluator.call(this);
        var self = this;
        this._logger = options.logger.fork('Control');

        this._pythonNotification = this._pythonNotification.bind(self);
        this._client = options.client;

        this._client.dispatchPluginNotification = overrideNotificationFunction;
        this._config = options.config;
        this._configId = options.configId;
        this._language = this._config.codeEditor.language || 'javascript';

        this._pythonExecutionAllowed = WebGMEGlobal.gmeConfig.plugin.allowServerExecution === true &&
            WebGMEGlobal.allPlugins.indexOf('PyCoreExecutor') !== -1;

        // Initialize core collections and variables
        this._widget = options.widget;
        this._widget.saveCode = function () {
            var node,
                editorCode,
                attributeName = self._config.codeEditor
                    .scriptCodeAttribute[self._language || 'javascript'];

            if (typeof self._currentNodeId === 'string' && self._isEditable === true) {
                node = self._client.getNode(self._currentNodeId);
                editorCode = self._widget.getCode();

                if (node && node.getOwnAttribute(attributeName) !== editorCode) {
                    self._client.setAttribute(
                        self._currentNodeId,
                        attributeName,
                        editorCode,
                        'ICoreControl updated [' + self._currentNodeId + '] attribute' +
                        attributeName + ' with new value.');
                }
            }

            self._widget.setUnsavedChanges(false);
            setTimeout(function () {
                self._widget._codeEditor.focus();
            });
        };

        this._widget.setUnsavedChanges = function (unsavedChanges) {
            if (unsavedChanges) {
                self.$btnSave._btn.enabled(self._isEditable);
            } else {
                self.$btnSave._btn.enabled(false);
            }
        };

        this._widget.executeCode = function () {
            self._widget.clearConsole();
            self._btnExecuteLoader.start();
            self.$btnExecute._btn.enabled(false);
            switch (self._language) {
                case 'python':
                    var context = self._client.getCurrentPluginContext('PyCoreExecutor'),
                        dialog;

                    context.pluginConfig = {script: self._widget.getCode()};
                    self._client.runServerPlugin('PyCoreExecutor', context, function (err, pluginResult) {
                        self._logger.info(err);
                        self._logger.info(pluginResult);
                        self._btnExecuteLoader.stop();
                        self.$btnExecute._btn.enabled(true);

                        if (pluginResult && pluginResult.artifacts && pluginResult.messages && (pluginResult.artifacts.length || pluginResult.messages.length)) {
                            //we have something to show
                            pluginResult = new PluginResult(pluginResult);
                            dialog = new PluginResultsDialog();
                            dialog.show(self._client, [pluginResult]);
                        }
                    });
                    break;
                default:
                    self.evaluateCode(function (err) {
                        if (err) {
                            self._widget.addConsoleMessage('error', ['Execution failed with error:', err.stack]);
                        } else {
                            self._widget.addConsoleMessage('info', ['Execution finished!']);
                        }

                        self._btnExecuteLoader.stop();
                        self.$btnExecute._btn.enabled(true);
                        self._widget._codeEditor.focus();
                    });
            }
        };

        this._currentNodeId = null;
        this._isEditable = true;

        this._btnExecuteLoader = null;
        this._logger.debug('ctor finished');
    }

    // Prototypical inheritance from ICorePluginEvaluator.
    ICoreControl.prototype = Object.create(ICorePluginEvaluator.prototype);
    ICoreControl.prototype.constructor = ICoreControl;

    /* * * * * * * * Visualizer content update callbacks * * * * * * * */
    // One major concept here is with managing the territory. The territory
    // defines the parts of the project that the visualizer is interested in
    // (this allows the browser to then only load those relevant parts).
    ICoreControl.prototype.selectedObjectChanged = function (nodeId) {
        var self = this;

        self._logger.debug('activeObject nodeId \'' + nodeId + '\'');

        // Remove current territory patterns
        if (self._currentNodeId) {
            self._client.removeUI(self._territoryId);
        }

        self._currentNodeId = nodeId;

        if (typeof self._currentNodeId === 'string') {
            // Put new node's info into territory rules
            self._selfPatterns = {};
            self._selfPatterns[nodeId] = {children: 0};  // Territory "rule"

            self._territoryId = self._client.addUI(self, function (events) {
                self._eventCallback(events);
            });

            // Update the territory
            self._client.updateTerritory(self._territoryId, self._selfPatterns);
        }
    };

    // This next function retrieves the relevant node information for the widget
    ICoreControl.prototype._getObjectDescriptor = function (nodeId) {
        var node = this._client.getNode(nodeId),
            objDescriptor,
            attributeName = this._config.codeEditor
                .scriptCodeAttribute[this._language];

        if (node) {

            objDescriptor = {
                id: node.getId(),
                name: node.getAttribute('name'),
                scriptCode: node.getAttribute(attributeName),
                editable: node.isReadOnly() === false,
                hasScriptAttribute: true,
                attributeName: attributeName,
                language: this._language
            };

            if (node.getId() !== '') {
                if (node.getValidAttributeNames().indexOf(attributeName) > -1) {
                    objDescriptor.hasScriptAttribute = node.isValidAttributeValueOf(
                        attributeName, 'string');
                    // this._config.codeEditor.scriptCodeAttribute, 'string');
                } else {
                    objDescriptor.hasScriptAttribute = false;
                }
            }
        } else {
            objDescriptor = {
                editable: false
            };
        }

        return objDescriptor;
    };

    /* * * * * * * * Node Event Handling * * * * * * * */
    ICoreControl.prototype._eventCallback = function (events) {
        var i = events ? events.length : 0,
            event;

        this._logger.debug('_eventCallback \'' + i + '\' items');

        while (i--) {
            event = events[i];
            switch (event.etype) {
                case CONSTANTS.TERRITORY_EVENT_LOAD:
                    this._onLoad(event.eid);
                    break;
                case CONSTANTS.TERRITORY_EVENT_UPDATE:
                    this._onUpdate(event.eid);
                    break;
                case CONSTANTS.TERRITORY_EVENT_UNLOAD:
                    this._onUnload(event.eid);
                    break;
                default:
                    break;
            }
        }

        this._logger.debug('_eventCallback \'' + events.length + '\' items - DONE');
    };

    ICoreControl.prototype._onLoad = function (gmeId) {
        var description = this._getObjectDescriptor(gmeId);
        if (description.hasScriptAttribute === false) {
            this._client.notifyUser({
                severity: 'warn',
                message: 'Written code will be stored in an attribute without definition!'
            });
            this._client.notifyUser({
                severity: 'warn',
                message: 'Add an attribute "' + description.attributeName + '" to a meta-node of ' +
                    'the current node in the Meta editor to avoid meta violations.'
            });
        }

        this._setEditable(description.editable);
        this._widget.addNode(description);
        if (this._language === 'python' && this._pythonExecutionAllowed !== true) {
            this.$btnExecute._btn.enabled(false);
        } else {
            this.$btnExecute._btn.enabled(true);
        }
        this._updateWidgetMETAHints();
    };

    ICoreControl.prototype._onUpdate = function (gmeId) {
        var description = this._getObjectDescriptor(gmeId);
        this._setEditable(description.editable);
        this._widget.updateNode(description);
    };

    ICoreControl.prototype._onUnload = function (gmeId) {
        this._widget.removeNode(gmeId);
    };

    ICoreControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
        if (this._currentNodeId === activeObjectId) {
            // The same node selected as before - do not trigger
        } else {
            clearTimeout(this._widget._autoSaveTimerId);
            this.selectedObjectChanged(activeObjectId);
        }
    };

    ICoreControl.prototype._updateWidgetMETAHints = function () {
        var META = {};

        try {
            this._client.getAllMetaNodes()
                .forEach(function (node) {
                    META[node.getFullyQualifiedName()] = node.getId();
                });
        } catch (e) {
            // In case we're switching projects or something like that.
            this._logger.error(e);
        }

        this._widget.METAHints = META;
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    ICoreControl.prototype.destroy = function () {
        this._detachClientEventListeners();
        this._removeToolbarItems();
    };

    ICoreControl.prototype._pythonNotification = function (__client, eventData) {
        if (this._language === 'python') {
            this._widget.addConsoleMessage(eventData.notification.severity || 'info',
                [eventData.notification.message]);
        }
    };

    ICoreControl.prototype._attachClientEventListeners = function () {

        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
        this._client.addEventListener(CONSTANTS.CLIENT.PLUGIN_NOTIFICATION, this._pythonNotification);
    };

    ICoreControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
        this._client.removeEventListener(CONSTANTS.CLIENT.PLUGIN_NOTIFICATION, this._pythonNotification);
    };

    ICoreControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
        this._displayToolbarItems();

        if (typeof this._currentNodeId === 'string') {
            WebGMEGlobal.State.registerActiveObject(this._currentNodeId, {suppressVisualizerFromNode: true});
        }
    };

    ICoreControl.prototype.onDeactivate = function () {
        this._detachClientEventListeners();
        this._hideToolbarItems();
    };

    ICoreControl.prototype._setEditable = function (editable) {
        if (this._isEditable !== editable) {
            this._isEditable = editable;

            this.$btnSave._btn.enabled(editable);
            this.$btnAutoSave._btn.enabled(editable);
        }
    };

    /* * * * * * * * * * Updating the toolbar * * * * * * * * * */
    ICoreControl.prototype._displayToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].show();
            }
        } else {
            this._initializeToolbar();
        }
    };

    ICoreControl.prototype._hideToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].hide();
            }
        }
    };

    ICoreControl.prototype._removeToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].destroy();
            }
        }
    };

    ICoreControl.prototype._initializeToolbar = function () {
        var self = this,
            toolBar = WebGMEGlobal.Toolbar;

        this._toolbarItems = [];

        this._toolbarItems.push(toolBar.addSeparator());
        // Set language
        var codeLangBtn = $('<i class="code-lang-btn">' + self._config.codeEditor.language + '</i>');
        this.$btnSetCodeLang = toolBar.addDropDownButton({
            title: 'Script Language',
            icon: codeLangBtn,
            menuClass: 'no-min-width',
            clickFn: function () {
                self.$btnSetCodeLang.clear();
                ['javascript', 'python'].forEach(function (lang) {
                    self.$btnSetCodeLang.addButton({
                        title: 'Click to select language',
                        text: lang,
                        clickFn: function () {
                            ComponentSettings.updateComponentSettings(self._configId, {
                                    codeEditor: {
                                        language: lang
                                    }
                                },
                                function (err) {
                                    if (err) {
                                        self._logger.error(err);
                                    }
                                });
                            codeLangBtn.text(lang);
                            self._language = lang;
                            self._onLoad(self._currentNodeId);
                        }
                    });
                });
            }
        });

        this._toolbarItems.push(this.$btnSetCodeLang);

        this._toolbarItems.push(toolBar.addSeparator());

        this.$btnExportToPlugin = toolBar.addButton({
            title: 'Export to a plugin',
            icon: 'fa fa-download',
            clickFn: function (/*data*/) {
                self._widget.exportToPlugin();
            }
        });

        this._toolbarItems.push(this.$btnExportToPlugin);

        if (WebGMEGlobal.allPlugins.indexOf('PluginGenerator') === -1) {
            this.$btnExportToPlugin._btn.enabled(false);
            this.$btnExportToPlugin._btn.prop('title', 'PluginGenerator not available');
        }

        // Load template
        var templateIds = {
                'javascript': [],
                'python': []
            },
            hasTemplates = false;

        Object.keys(this._config.templates).forEach(function (templateId) {
            var templateLanguage = self._config.templates[templateId].language || 'javascript';
            templateIds[templateLanguage].push(templateId);
            hasTemplates = true;
        });

        //TODO sort based on display name

        if (hasTemplates) {
            this.$btnLoadTemplate = toolBar.addDropDownButton({
                title: 'Load template',
                icon: 'glyphicon glyphicon-floppy-open',
                menuClass: 'no-min-width',
                clickFn: function () {
                    self.$btnLoadTemplate.clear();
                    var tempIds = templateIds[self._language];
                    tempIds.forEach(function (templateId) {
                        var template = self._config.templates[templateId];
                        self.$btnLoadTemplate.addButton({
                            title: template.description,
                            text: template.displayName,
                            clickFn: function () {
                                self._widget.loadTemplate(templateId);
                            }
                        });
                    });
                }
            });

            this._toolbarItems.push(this.$btnLoadTemplate);
        }

        // Auto-save
        this.$btnAutoSave = toolBar.addToggleButton({
            title: 'Turn ' + (self._config.codeEditor.autoSave ? 'off' : 'on') + ' auto-save',
            icon: 'glyphicon glyphicon-floppy-saved',
            clickFn: function (data, toggled) {
                self.$btnAutoSave._btn.attr('title', 'Turn ' + (toggled ? 'off' : 'on') + ' auto-save');

                ComponentSettings.updateComponentSettings('ICorePanel', {codeEditor: {autoSave: toggled}},
                    function (err) {
                        if (err) {
                            self._logger.error(err);
                        }
                    });

                self._widget.setAutoSave(toggled);
            }
        });

        this.$btnAutoSave.setToggled(self._config.codeEditor.autoSave);

        this._toolbarItems.push(this.$btnAutoSave);

        // Save
        this.$btnSave = toolBar.addButton({
            title: 'Save code [Ctrl + S]',
            icon: 'glyphicon glyphicon-floppy-disk',
            clickFn: function (/*data*/) {
                self._widget.saveCode();
            }
        });

        this._toolbarItems.push(this.$btnSave);
        this.$btnSave._btn.enabled(false);

        this._toolbarItems.push(toolBar.addSeparator());

        // Orientation
        this.$btnOrientation = toolBar.addButton({
            title: 'Switch orientation',
            icon: 'fa fa-columns',
            clickFn: function () {
                var toggled = !self._widget._verticalSplit;
                ComponentSettings.updateComponentSettings(self._configId, {
                        consoleWindow: {
                            verticalOrientation: toggled
                        }
                    },
                    function (err) {
                        if (err) {
                            self._logger.error(err);
                        }
                    });

                self._widget.setOrientation(toggled);
            }
        });

        this._toolbarItems.push(this.$btnOrientation);

        // Set log-level
        var logLvlBtn = $('<i class="log-level-btn">' + self._config.consoleWindow.logLevel + '</i>');
        this.$btnSetLogLevel = toolBar.addDropDownButton({
            title: 'Console log-level',
            icon: logLvlBtn,
            menuClass: 'no-min-width',
            clickFn: function () {
                self.$btnSetLogLevel.clear();
                ['debug', 'info', 'warn', 'error'].forEach(function (level) {
                    self.$btnSetLogLevel.addButton({
                        title: 'Click to select level',
                        text: level,
                        clickFn: function () {
                            ComponentSettings.updateComponentSettings(self._configId, {
                                    consoleWindow: {
                                        logLevel: level
                                    }
                                },
                                function (err) {
                                    if (err) {
                                        self._logger.error(err);
                                    }
                                });

                            logLvlBtn.text(level);
                            self._widget.setLogLevel(level);
                        }
                    });
                });
            }
        });

        this._toolbarItems.push(this.$btnSetLogLevel);

        // Clear console
        // this.$btnClearConsole = toolBar.addButton({
        //     title: 'Clear console [Esc]',
        //     icon: 'fa fa-ban',
        //     clickFn: function (/*data*/) {
        //         self._widget.clearConsole();
        //     }
        // });
        //
        // this._toolbarItems.push(this.$btnClearConsole);

        this._toolbarItems.push(toolBar.addSeparator());

        // Execute
        this.$btnExecute = toolBar.addButton({
            title: 'Execute code [Ctrl + Q]',
            icon: 'glyphicon glyphicon-play-circle',
            clickFn: function (/*data*/) {
                self._widget.executeCode();
            }
        });

        this._btnExecuteLoader = new LoaderCircles({containerElement: this.$btnExecute.el.find('.glyphicon')});
        this._btnExecuteLoader.setSize(20);

        this._toolbarItems.push(this.$btnExecute);

        this._toolbarItems.push(toolBar.addSeparator());

        // Video help
        this.$btnHelpVideo = toolBar.addButton({
            title: 'View instruction video',
            icon: 'fa fa-question',
            clickFn: function (/*data*/) {
                window.open(YOUTUBE_VIDEO_URL, '_blank');
            }
        });

        this._toolbarItems.push(this.$btnHelpVideo);

        this._toolbarInitialized = true;
    };

    return ICoreControl;
});
