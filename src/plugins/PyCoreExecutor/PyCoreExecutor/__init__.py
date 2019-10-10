"""
This is where the implementation of the plugin code goes.
The PyCoreExecutor-class is imported from both run_plugin.py and run_debug.py
"""
import sys
import importlib
from webgme_bindings import PluginBase

is_python_3 = sys.version_info > (3, 0)

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
    def main(self, active_selection):
        core = self.core
        config = self.get_current_config()
        scope = {'PluginBase': PluginBase}
        additionalModules = config['additionalModules'].split(',')
        modules = {}

        for module in additionalModules:
            modules[modules] = importlib.import_module(module);

        if is_python_3:
            exec(config['script'], scope);
        else:
            exec(config['script'])
            scope['PythonPlugin'] = PythonPlugin

        plugin = scope['PythonPlugin'](self._webgme, self.commit_hash, self.branch_name, core.get_path(self.active_node), active_selection, self.namespace)
        NotificationLogger(plugin)

        plugin.main();
