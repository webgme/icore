"""
This is where the implementation of the plugin code goes.
The PyCoreExecutor-class is imported from both run_plugin.py and run_debug.py
"""
import sys
from webgme_bindings import PluginBase

class NotificationLogger(object):
    def __init__(self, plugin):
        self._plugin = plugin
        plugin.logger = self

    def _send(self, payload):
            self._plugin.send_notification(payload)

    def debug(self, msg):
        self._send({'severity':'debug','message':msg})

    def info(self, msg):
        self._send({'severity':'info','message':msg})

    def error(self, msg):
        self._send({'severity':'error','message':msg})

    def warn(self, msg):
        self._send({'severity':'warn','message':msg})

class PyCoreExecutor(PluginBase):
    def main(self):
        core = self.core
        root_node = self.root_node
        active_node = self.active_node
        config = self.get_current_config()

        exec(config["script"]);

        active_selection = [];
        if self.active_selection is not None:
                    for as_path in self.active_selection:
                        active_selection.append(core.get_path(as_path))


        plugin = PythonPlugin(self._webgme, self.commit_hash, self.branch_name, core.get_path(active_node), active_selection, self.namespace)
        NotificationLogger(plugin)

        plugin.main();
