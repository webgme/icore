/*globals define*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'codemirror/lib/codemirror',
    'css!codemirror/lib/codemirror.css',
    'css!codemirror/theme/monokai.css'
], function (codeMirror) {
    'use strict';

    codeMirror.defineMode('ICoreConsole', function () {
        return {
            startState: function () {
                return {
                    inString: false
                };
            },
            token: function (stream, state) {
                // If a string starts here
                if (!state.inString && stream.peek() == '"') {
                    stream.next();            // Skip quote
                    state.inString = true;    // Update state
                }

                if (state.inString) {
                    if (stream.skipTo('"')) { // Quote found on this line
                        stream.next();          // Skip quote
                        state.inString = false; // Clear flag
                    } else {
                        stream.skipToEnd();    // Rest of line is string
                    }

                    return 'string';          // Token style
                } else {
                    if (stream.match(/^debug:/, true)) {
                        stream.backUp(1);
                        return 'debug';
                    } else if (stream.match(/^info :/, true)) {
                        stream.backUp(1);
                        return 'info';
                    } else if (stream.match(/^warn :/, true)) {
                        stream.backUp(1);
                        return 'warn';
                    } else if (stream.match(/^error:/, true)) {
                        stream.backUp(1);
                        return 'error-log';
                    }

                    stream.skipTo('"') || stream.skipToEnd();
                    return null;              // Unstyled token
                }
            }
        };
    });
});