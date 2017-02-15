/*globals define, _, WebGMEGlobal*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define(['js/KeyboardManager/IKeyTarget'], function (IKeyTarget) {
    'use strict';

    function ICoreKeyboard() {

    }

    _.extend(ICoreKeyboard.prototype, IKeyTarget.prototype);

    ICoreKeyboard.prototype._registerKeyboardListener = function () {
        WebGMEGlobal.KeyboardManager.setListener(this);
    };

    ICoreKeyboard.prototype._unregisterKeyboardListener = function () {
        WebGMEGlobal.KeyboardManager.setListener(undefined);
    };

    ICoreKeyboard.prototype.onKeyDown = function (eventArgs) {
        var bubble = true;

        switch (eventArgs.combo) {
            case 'esc':
                bubble = false;
                this.toggleConsole();
                break;
            case 'ctrl+s':
                this.saveCode();
                bubble = false;
                break;
            default:
                break;
        }

        return bubble;
    };

    ICoreKeyboard.prototype.onKeyUp = function (/*eventArgs*/) {
    };


    return ICoreKeyboard;
});
