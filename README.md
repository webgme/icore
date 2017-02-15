# ICore
Code-editor for interacting with models uses the same APIs available from a plugin (context is the main function of a plugin).
Note that this visualizer uses `eval` to evaluate the code and is recommended to only be used at dev-deployments.

- Import using the webgme-cli tool `webgme import viz ICore webgme/ui-components`
- Register visualizer at nodes where it should be available.
- If `scriptCode` attribute is defined the code can be saved back to model.
- See [ICoreDefaultConfig](src/visualizers/panels/ICore/ICoreDefaultConfig.json) for options.

![ICore](images/icore.png "ICore in action - note the controls in the toolbar")

## Importing into other repository
```
webgme import viz ICore webgme-icore
```

Once imported and server is restarted, register the visualizer at the nodes where it should be used. If the `'scriptCode'` attribute (configurable) isn't defined, 
you won't be able to save the code in the model.