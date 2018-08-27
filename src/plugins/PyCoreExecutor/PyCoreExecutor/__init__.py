"""
This is where the implementation of the plugin code goes.
The PyCoreExecutor-class is imported from both run_plugin.py and run_debug.py
"""
import sys
import logging
from webgme_bindings import PluginBase

# Setup a logger
logger = logging.getLogger('PyCoreExecutor')
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)  # By default it logs to stderr..
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


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

        plugin.main();
