/*globals define, $, WebGMEGlobal, _, requirejs*/
/*jshint browser: true*/

/**
 * Widget with two code mirror instances - one for editing the main function of a "virtual plugin" and
 * one displaying the logger output from the plugin.
 */

define([
    // These are only used to generate the hints for code completion..
    'common/core/core',
    'common/storage/project/interface',
    'plugin/PluginBase',
    'blob/BlobClient',
    'js/Utils/WebGMEUrlManager',
    'common/util/ejs',
    'js/Utils/SaveToDisk',
    'js/Dialogs/Confirm/ConfirmDialog',
    'js/Utils/ComponentSettings',

    'codemirror/lib/codemirror',
    'codemirror/addon/hint/show-hint',
    'jquery',
    './ICoreConsoleCodeMirrorMode',
    'css!./styles/ICoreWidget.css',
    'css!codemirror/addon/hint/show-hint.css'
], function (Core,
             ProjectInterface,
             PluginBase,
             BlobClient,
             WebGMEUrlManager,
             ejs,
             saveToDisk,
             ConfirmDialog,
             ComponentSettings,
             codeMirror) {

    'use strict';

    function camelCaseArrayToPythonArray(inputStrings) {
        return inputStrings.map(function (inputString) {
            return inputString.replace(/([A-Z])/g, function ($1) {
                return '_' + $1.toLowerCase();
            });
        });
    }

    var ICoreWidget,
        WIDGET_CLASS = 'icore-widget',
        LOG_LEVELS = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        },
        HINT_TYPES = {
            FUNCTION: {
                class: 'function',
                text: 'F'
            },
            ASYNC: {
                class: 'async-function',
                text: 'F'
            },
            STRING: {
                class: 'string',
                text: 'S'
            },
            ARRAY: {
                class: 'array',
                text: 'A'
            },
            BOOLEAN: {
                class: 'boolean',
                text: 'B'
            },
            NUMBER: {
                class: 'number',
                text: 'N'
            },
            OBJECT: {
                class: 'object',
                text: 'O'
            },
            META_NODE: {
                class: 'meta-node',
                text: 'M'
            }
        },
        CORE_EXTRA_ASYNCS = ['generateTreeDiff', 'addLibrary', 'updateLibrary', 'traverse'],
        PROJECT_EXCLUDES = ['ID_NAME', 'logger', 'projectCache', 'insertObject', 'insertPatchObject', 'loadObject',
            'loadPaths'],
        PROJECT_TYPE_MAP = {
            projectId: 'STRING',
            projectName: 'STRING',
            CONSTANTS: 'OBJECT'
        },
        PLUGIN_EXCLUDES = ['pluginMetadata', '_currentConfig', 'isConfigured', 'notificationHandlers', 'main',
            'updateMETA', '_createFork', 'isInvalidActiveNode', 'initialize', 'configure', 'setCurrentConfig',
            // These are fine to call but doesn't add any help.
            'getMetadata', 'getId', 'getName', 'getDescription', 'getConfigStructure', 'getCurrentConfig',
            'addCommitToResult', 'getDefaultConfig', 'getVersion'
        ],
        PLUGIN_TYPE_MAP = {
            gmeConfig: 'OBJECT',
            logger: 'OBJECT',
            blobClient: 'OBJECT',
            core: 'OBJECT',
            project: 'OBJECT',
            projectName: 'STRING',
            projectId: 'STRING',
            branchName: 'STRING',
            branchHash: 'STRING',
            commitHash: 'STRING',
            currentHash: 'STRING',

            rootNode: 'OBJECT',
            activeNode: 'OBJECT',
            activeSelection: 'ARRAY',

            namespace: 'STRING',
            META: 'OBJECT',
            result: 'OBJECT',

            save: 'ASYNC',
            fastForward: 'ASYNC',
            loadNodeMap: 'ASYNC'
        },
        BLOB_EXCLUDES = [
            // Also excludes all ending with URL
            '_getUrl', 'getArtifact', 'setToken'],
        BLOB_TYPE_MAP = {
            createArtifact: 'FUNCTION',
            getHumanSize: 'FUNCTION',
            getDownloadURL: 'FUNCTION'
        },
        coreHints,
        pluginHints,
        projectHints,
        blobHints;


    ICoreWidget = function (logger, container, config, configId) {
        var templateId,
            dummyCore,
            dummyPlugin,
            dummyProject;

        this._logger = logger.fork('Widget');
        this._config = config;
        this._configId = configId;

        if (!coreHints) {
            dummyProject = new ProjectInterface('dummy+id', {}, logger, WebGMEGlobal.gmeConfig);

            dummyCore = new Core(dummyProject, {globConf: WebGMEGlobal.gmeConfig, logger: logger});
            coreHints = Object.keys(dummyCore);
            coreHints.sort();

            projectHints = _.difference(Object.keys(dummyProject), PROJECT_EXCLUDES);
            projectHints.sort();

            dummyPlugin = new PluginBase();
            pluginHints = _.union(Object.keys(PluginBase.prototype), Object.keys(dummyPlugin));
            pluginHints = _.difference(pluginHints, PLUGIN_EXCLUDES);
            pluginHints.sort();

            blobHints = _.difference(Object.keys(BlobClient.prototype), BLOB_EXCLUDES);
            blobHints = blobHints.filter(function (name) {
                return name === 'getDownloadURL' || !name.match('URL$');
            });
            blobHints.sort();
        }

        // These are populated by the controller.
        this.METAHints = {};

        this._el = container;
        this._logLevel = LOG_LEVELS[config.consoleWindow.logLevel] || 0;
        this._autoSave = config.codeEditor.autoSave;
        this._autoSaveTimerId = null;
        this._templates = config.templates;
        this._defaultTemplateIds = {};
        this._verticalSplit = true;
        this._splitterRelPos = 0.5;

        this._language = config.codeEditor.language || 'javascript';

        for (templateId in this._templates) {
            if (this._templates[templateId].default) {
                this._defaultTemplateIds[this._templates[templateId].language || 'javascript'] = templateId;
            }
        }

        // if (!this._defaultTemplateId) {
        //     this._logger.warn('No default template defined!');
        // }

        this._initialize(config);

        this._logger.debug('ctor finished');
    };

    ICoreWidget.prototype._initialize = function (config) {
        var self = this,
            codeEditorOptions = {
                value: '',
                mode: this._language,
                lineNumbers: true,
                matchBrackets: true,
                tabSize: 2,
                gutters: ['CodeMirror-linenumbers']
            },
            consoleWindowOptions = {
                value: '',
                mode: 'ICoreConsole',
                readOnly: true,
                lineWrapping: true,
                theme: 'monokai'
            },
            extraKeys = {
                'Ctrl-S': function () {
                    self.saveCode();
                },
                Esc: function () {
                    self.clearConsole();
                },
                'Ctrl-Q': function () {
                    self.executeCode();
                },
                Tab: function betterTab(cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection(cm.getOption('indentWithTabs') ? '\t' :
                            Array(cm.getOption('indentUnit') + 1).join(' '), 'end', '+input');
                    }
                },
                'Ctrl-Space': function (cm) {
                    cm.showHint({
                        closeOnUnfocus: false,
                        completeSingle: false,
                        hint: function (cm) {
                            var cursor = cm.getCursor(),
                                token = cm.getTokenAt(cursor),
                                filter,
                                hints;

                            if (token.string === '.') {
                                token = cm.getTokenAt({line: cursor.line, ch: cursor.ch - 1});
                                if (token.type === 'property' || token.type === 'variable-2' ||
                                    token.type === 'keyword' || token.type === 'variable') {

                                    hints = self.getHintsForClass(token);
                                }
                            } else if (token.type === 'property') {
                                filter = token.string;
                                filter = filter.substring(0, filter.length - (token.end - cursor.ch));
                                token = cm.getTokenAt({line: cursor.line, ch: token.start - 1});
                                if (token.type === 'property' || token.type === 'variable-2' ||
                                    token.type === 'keyword' || token.type === 'variable') {

                                    hints = self.getHintsForClass(token, filter);
                                }
                            }

                            return {from: cursor, to: cursor, list: hints || []};
                        }
                    });
                }
            };

        this._el.addClass(WIDGET_CLASS);

        // The code editor.
        this._codeEditor = codeMirror(this._el[0], codeEditorOptions);
        $(this._codeEditor.getWrapperElement()).addClass('code-editor');

        this._codeEditor.on('beforeChange', function (cm, change) {
            if (change.origin !== 'setValue' && change.from.line < 2 && self._language === 'python') {
                change.cancel();
            }
        });

        this._codeEditor.on('change', function (cm, event) {
            if (event.origin !== 'setValue') {
                if (self._autoSave) {
                    clearTimeout(self._autoSaveTimerId);
                    self._autoSaveTimerId = setTimeout(function () {
                        self._autoSaveTimerId = null;
                        self.saveCode();
                    }, config.codeEditor.autoSaveInterval);
                }

                self.setUnsavedChanges(true);
            }
        });

        this._codeEditor.setOption('extraKeys', extraKeys);

        // The Splitter
        this._splitterEl = $('<div/>', {class: 'icore-splitter'});
        this._el.append(this._splitterEl);
        this._splitterEl.on('mousedown', function (event) {
            self._startSplitterResize(event);
            event.stopPropagation();
            event.preventDefault();
        });
        this._splitterRelPos = 0.5;

        // The console window.
        this._consoleWindow = codeMirror(this._el[0], consoleWindowOptions);
        $(this._consoleWindow.getWrapperElement()).addClass('console-window');
        this._consoleWindow.setOption('extraKeys', extraKeys);


        this._initConsoleText();

        this._logs = [];


        this.setOrientation(config.consoleWindow.verticalOrientation);
    };

    ICoreWidget.prototype.getHintsForClass = function (token, filter) {
        var self = this,
            hints;

        function getRenderFunction(name, type, path) {
            return function (el/*, cm, data*/) {
                var $el = $(el),
                    anchor = $('<a target="_blank"/>'),
                    url;

                if (type === HINT_TYPES.META_NODE) {

                    url = '/?' + WebGMEUrlManager.getSearchQuery({
                        projectId: WebGMEGlobal.State.getActiveProjectName(),
                        branchName: WebGMEGlobal.State.getActiveBranch(),
                        commitId: WebGMEGlobal.State.getActiveCommit(),
                        nodeId: path
                    });

                    anchor.prop('title', 'View meta-node in new window');
                    anchor.attr('href', url);
                } else {
                    anchor.prop('title', 'View docs');
                    anchor.attr('href', '/docs/source/' + path + '#' + name + '__anchor');
                }

                anchor.append($('<i class="glyphicon glyphicon-share"/>'));

                $el.append($('<span>', {
                    class: 'circle ' + type.class,
                    title: type.class,
                    text: type.text
                }));
                $el.append($('<span>', {
                    class: 'hint-text ' + type.class,
                    text: name
                }));
                $el.append(anchor);
            };
        }

        function getCompletionText(name, filter, type) {
            var text = name.substring(filter.length);

            if (type === HINT_TYPES.FUNCTION || type === HINT_TYPES.ASYNC) {
                text += '(';
            }

            return text;
        }

        filter = filter || '';

        switch (self._language) {
            case 'python':
                switch (token.string) {
                    case 'core':
                        hints = camelCaseArrayToPythonArray(coreHints)
                            .filter(function (name) {
                                return name.indexOf(filter) === 0;
                            })
                            .map(function (name) {
                                var type = HINT_TYPES.FUNCTION;

                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, 'Core.html')
                                };
                            });
                        break;
                    case 'logger':
                        hints = ['debug', 'info', 'warn', 'error']
                            .filter(function (name) {
                                return name.indexOf(filter) === 0;
                            })
                            .map(function (name) {
                                var type = HINT_TYPES.FUNCTION;
                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, HINT_TYPES.FUNCTION, 'GmeLogger.html')
                                };
                            });
                        break;
                }
                break;
            default:
                switch (token.string) {
                    case 'core':
                        hints = coreHints
                            .filter(function (name) {
                                return name.indexOf(filter) === 0;
                            })
                            .map(function (name) {
                                var type = name.indexOf('load') === 0 || CORE_EXTRA_ASYNCS.indexOf(name) > -1 ?
                                    HINT_TYPES.ASYNC : HINT_TYPES.FUNCTION;

                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, 'Core.html')
                                };
                            });
                        break;
                    case 'blobClient':
                        hints = blobHints.filter(function (name) {
                            return name.indexOf(filter) === 0;
                        })
                            .map(function (name) {
                                var type = BLOB_TYPE_MAP[name] ? HINT_TYPES[BLOB_TYPE_MAP[name]] : HINT_TYPES.ASYNC;

                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, 'BlobClient.html')
                                };
                            });
                        break;
                    case 'project':
                        hints = projectHints.filter(function (name) {
                            return name.indexOf(filter) === 0;
                        })
                            .map(function (name) {
                                var type = PROJECT_TYPE_MAP[name] ? HINT_TYPES[PROJECT_TYPE_MAP[name]] : HINT_TYPES.ASYNC;

                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, 'ProjectInterface.html')
                                };
                            });
                        break;
                    case 'logger':
                        hints = ['debug', 'info', 'warn', 'error']
                            .filter(function (name) {
                                return name.indexOf(filter) === 0;
                            })
                            .map(function (name) {
                                var type = HINT_TYPES.FUNCTION;
                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, HINT_TYPES.FUNCTION, 'GmeLogger.html')
                                };
                            });
                        break;
                    case 'this':
                    case 'self':
                        hints = pluginHints.filter(function (name) {
                            return name.indexOf(filter) === 0;
                        })
                            .map(function (name) {
                                var type = PLUGIN_TYPE_MAP[name] ? HINT_TYPES[PLUGIN_TYPE_MAP[name]] : HINT_TYPES.FUNCTION;

                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, 'PluginBase.html')
                                };
                            });
                        break;
                    case 'META':
                        hints = Object.keys(this.METAHints).filter(function (name) {
                            return name.indexOf(filter) === 0;
                        })
                            .map(function (name) {
                                var type = HINT_TYPES.META_NODE;
                                return {
                                    text: getCompletionText(name, filter, type),
                                    className: 'icore-hint',
                                    render: getRenderFunction(name, type, self.METAHints[name])
                                };
                            });
                        break;
                    default:
                        hints = [];
                        break;
                }
        }

        return hints;
    };

    ICoreWidget.prototype._initConsoleText = function () {
        switch (this._language) {
            case 'javascript':
                this._consoleStr = 'Use the logger to print here (e.g. this.logger.info)';
                break;
            case 'python':
                this._consoleStr = 'Use the logger to print here (e.g. python specific)';
                break;
        }
    };

    // Adding/Removing/Updating items
    ICoreWidget.prototype.addNode = function (desc) {
        this._codeEditor.setOption('mode', desc.language);

        if (typeof desc.scriptCode === 'string') {
            this._codeEditor.setValue(desc.scriptCode);
        } else if (typeof this._defaultTemplateIds[desc.language] === 'string') {
            this._codeEditor.setValue(this._templates[this._defaultTemplateIds[desc.language]].script);
        } else {
            this._codeEditor.setValue('');
        }

        if (this._language !== desc.language) {
            this._language = desc.language;
            this._initConsoleText();
        }

        this._consoleWindow.setValue(this._consoleStr);

        if (desc.language === 'python') {
            this._codeEditor.addLineClass(0, 'background', 'python-greyed');
            this._codeEditor.addLineClass(1, 'background', 'python-greyed');
        } else {
            this._codeEditor.removeLineClass(0, 'background', 'python-greyed');
            this._codeEditor.removeLineClass(1, 'background', 'python-greyed');
        }

        this._consoleWindow.refresh();
        this._codeEditor.refresh();
    };

    ICoreWidget.prototype.removeNode = function (/*gmeId*/) {
        this._codeEditor.setValue('// Node was removed');
        clearTimeout(this._autoSaveTimerId);
    };

    ICoreWidget.prototype.updateNode = function (desc) {
        if (typeof desc.scriptCode === 'string' && desc.scriptCode !== this._codeEditor.getValue()) {
            clearTimeout(this._autoSaveTimerId);
            this._codeEditor.setValue(desc.scriptCode);
        }
    };

    ICoreWidget.prototype.getCode = function () {
        return this._codeEditor.getValue();
    };

    ICoreWidget.prototype.addConsoleMessage = function (level, logPieces) {
        var scrollInfo,
            timestamp = Date.now(),
            logMessage = logPieces.map(function (arg) {
                return typeof arg === 'string' ? arg : JSON.stringify(arg);
            }).join(' '),
            logData = {
                level: level,
                timestamp: timestamp,
                message: logMessage
            };

        this._logs.push(logData);

        if (this._logMessage(logData)) {
            this._consoleWindow.setValue(this._consoleStr);
            scrollInfo = this._consoleWindow.getScrollInfo();
            this._consoleWindow.scrollTo(scrollInfo.left, scrollInfo.height);
        }
    };

    ICoreWidget.prototype._logMessage = function (logData) {
        var didLog = false,
            level = logData.level;

        if (LOG_LEVELS[level] >= this._logLevel) {
            level = level.length === 5 ? level : level + ' ';
            level = this._consoleStr.length === 0 ? level : '\n' + level;

            this._consoleStr += level + ': ' + logData.message;

            didLog = true;
        }

        return didLog;
    };

    ICoreWidget.prototype.setLogLevel = function (level) {
        var i,
            scrollInfo;

        if (LOG_LEVELS[level] === this._logLevel) {
            return;
        }

        this._logLevel = LOG_LEVELS[level];
        this._consoleStr = '';

        for (i = 0; i < this._logs.length; i += 1) {
            this._logMessage(this._logs[i]);
        }

        this._consoleWindow.setValue(this._consoleStr);
        scrollInfo = this._consoleWindow.getScrollInfo();
        this._consoleWindow.scrollTo(scrollInfo.left, scrollInfo.height);
        this._codeEditor.focus();
    };

    ICoreWidget.prototype.setCodeLanguage = function (lang) {
        this._language = lang;
        this._codeEditor.setOption("mode", lang);
    };

    ICoreWidget.prototype.clearConsole = function () {
        this._consoleStr = '';
        this._consoleWindow.setValue(this._consoleStr);
        this._logs = [];
        this._codeEditor.focus();
    };

    ICoreWidget.prototype.setOrientation = function (vertical) {
        this._verticalSplit = vertical;

        this._codeEditor.focus();
        this._codeEditor.refresh();
        this._consoleWindow.refresh();
        this._updateUI();
    };

    ICoreWidget.prototype.loadTemplate = function (id) {
        var template = this._templates[id];
        clearTimeout(this._autoSaveTimerId);

        this._codeEditor.setValue(template.script);
        this._consoleWindow.setValue(template.description);

        this._consoleWindow.refresh();
        this._codeEditor.refresh();

        this._codeEditor.focus();
    };

    ICoreWidget.prototype.setAutoSave = function (enable) {
        clearTimeout(this._autoSaveTimerId);
        this._autoSave = enable;

        this._codeEditor.focus();
    };

    ICoreWidget.prototype.exportToPlugin = function () {
        var self = this;

        requirejs(['text!plugin/PluginGenerator/PluginGenerator/Templates/plugin.js.ejs'],
            function (template) {
                var d = new ConfirmDialog();

                d.show({
                    title: 'Export to Plugin',
                    iconClass: 'fa fa-download',
                    htmlQuestion: $('<div>Will generate &lt;PluginID&gt;.js. Note that this will only export the ' +
                        '"main" file for the plugin. Unless overwriting an existing plugin you will have to edit the ' +
                        'gmeConfig and add all necessary files. However it is recommended to first ' +
                        'generate the boilerplate code using ' +
                        '<a href="https://github.com/webgme/webgme-cli" target="_blank">webgme-cli</a>.</div>'),
                    input: {
                        label: 'PluginID',
                        placeHolder: self._config.defaultPluginId || 'Enter PluginID...',
                        required: false,
                        checkFn: function (value) {
                            if (self._config.defaultPluginId && !value) {
                                return true;
                            }

                            return /^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[a-zA-Z_$][0-9a-zA-Z_$]*/.test(value);
                        }
                    },
                    severity: 'info'
                }, function (_dummy, enteredName) {

                    if (self._config.defaultPluginId && !enteredName) {
                        enteredName = self._config.defaultPluginId;
                    } else {
                        // There was a new name entered store it in user settings.

                        ComponentSettings.updateComponentSettings(self._configId, {defaultPluginId: enteredName},
                            function (err) {
                                if (err) {
                                    self._logger.error(err);
                                } else {
                                    self._config.defaultPluginId = enteredName;
                                }
                            });
                    }

                    var pluginJs = ejs.render(template, {
                        // PluginGenerator config as of webgme v2.16.0
                        // The rendering of the template throws if any is missing!
                        main: self.getCode(),
                        pluginID: enteredName,
                        pluginName: '',
                        description: '',
                        test: false,
                        templateType: '',
                        configStructure: false,
                        meta: false,
                        version: '2.16.0',
                        date: new Date()
                    });

                    console.log(pluginJs);
                    saveToDisk.downloadTextAsFile(enteredName + '.js', pluginJs);
                });


            },
            function (err) {
                self._logger.error('Could not load plugin template for export', err);
            }
        );
    };

    // Splitter methods (borrowed from SplitPanel)
    ICoreWidget.prototype._startSplitterResize = function (event) {
        var self = this;

        this._splitterResize = this._splitterEl.clone().addClass('resize');
        this._el.append(this._splitterResize);

        this._splitterResizePos = this._splitterRelPos;
        this._splitStartMousePos = this._verticalSplit ? event.pageX : event.pageY;

        $(document).on('mousemove.icore-widget', function (event) {
            self._onMouseMove(event);
        });
        $(document).on('mouseup.icore-widget', function (event) {
            self._onMouseUp(event);
        });
    };

    ICoreWidget.prototype._onMouseMove = function (event) {
        var mousePos = this._verticalSplit ? event.pageX : event.pageY,
            mouseDelta = mousePos - this._splitStartMousePos,
            maxVal = this._verticalSplit ? this._width : this._height,
            resizeDelta = mouseDelta / maxVal,
            snapDistance = 10 / maxVal,
            minPanelSize = 20 / maxVal;

        this._splitterResizePos = this._splitterRelPos + resizeDelta;

        if (this._splitterResizePos >= 0.5 - snapDistance &&
            this._splitterResizePos <= 0.5 + snapDistance) {
            this._splitterResizePos = 0.5;
        }

        if (this._splitterResizePos < minPanelSize) {
            this._splitterResizePos = minPanelSize;
        }

        if (this._splitterResizePos > 1 - minPanelSize) {
            this._splitterResizePos = 1 - minPanelSize;
        }

        if (this._verticalSplit) {
            this._splitterResize.css({
                width: 6,
                height: this._height,
                top: 0,
                left: Math.floor((this._width - 6) * this._splitterResizePos)
            });
        } else {
            this._splitterResize.css({
                width: this._width,
                height: 6,
                top: Math.floor((this._height - 6) * this._splitterResizePos),
                left: 0
            });
        }
    };

    ICoreWidget.prototype._onMouseUp = function () {
        $(document).off('mousemove.icore-widget');
        $(document).off('mouseup.icore-widget');

        this._splitterRelPos = this._splitterResizePos;

        this._splitterResize.remove();
        this._splitterResize = undefined;
        this._splitterResizePos = undefined;

        this._updateUI();
    };

    ICoreWidget.prototype._updateUI = function () {
        var w1 = this._width,
            h1 = this._height,
            w2 = this._width,
            h2 = this._height,
            sw = 4,
            sh = 4,
            p1Top = 0,
            p1Left = 0,
            splitterTop = 0,
            splitterLeft = 0,
            p2Top = 0,
            p2Left = 0;


        if (this._verticalSplit) {
            sh = this._height;
            w1 = Math.floor((this._width - sw) * this._splitterRelPos);
            w2 = this._width - w1 - sw;
            this._splitterEl.removeClass('horizontal');
            this._splitterEl.addClass('vertical');
            p1Left = 0;
            splitterLeft = w1;
            p2Left = w1 + sw;
        } else {
            sw = this._width;
            h1 = Math.floor((this._height - sh) * this._splitterRelPos);
            h2 = this._height - h1 - sh;
            this._splitterEl.removeClass('vertical');
            this._splitterEl.addClass('horizontal');
            p1Top = 0;
            splitterTop = h1;
            p2Top = h1 + sh;
        }

        this._splitterEl.css({
            width: sw,
            height: sh,
            top: splitterTop,
            left: splitterLeft
        });

        $(this._codeEditor.getWrapperElement()).css({
            width: w1,
            height: h1,
            top: p1Top,
            left: p1Left
        });

        $(this._consoleWindow.getWrapperElement()).css({
            width: w2,
            height: h2,
            top: p2Top,
            left: p2Left
        });
    };

    ICoreWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._width = width;
        this._height = height;

        this._el.width(width);
        this._el.height(height);
        this._logger.debug('Widget is resizing...');
        this._updateUI();
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    ICoreWidget.prototype.destroy = function () {
        clearTimeout(this._autoSaveTimerId);
        this._el.off();
    };

    ICoreWidget.prototype.onActivate = function () {
        this._logger.debug('ICoreWidget has been activated');
        this._codeEditor.focus();
    };

    ICoreWidget.prototype.onDeactivate = function () {
        this._logger.debug('ICoreWidget has been deactivated');
    };

    return ICoreWidget;
});
