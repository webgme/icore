# ICore
Code-editor for interacting with models uses the same APIs available from a plugin (context is the main function of a plugin).
Note that this visualizer uses `eval` to evaluate the code and is recommended to only be used at dev-deployments or at least not at deployments where security is a major concern.

- See [ICoreDefaultConfig](src/visualizers/panels/ICore/ICoreDefaultConfig.json) for options.

![ICore](images/icore.png "ICore in action - note the controls in the toolbar")

## Importing into other repository
```
webgme import viz ICore webgme-icore
```

Once imported and server is restarted, register the visualizer at the nodes where it should be used. If the `'scriptCode'` attribute (configurable) isn't defined, 
you won't be able to save the code in the model.

## Running from this repository
Make sure the [dependencies for webgme](https://github.com/webgme/webgme/blob/master/README.md#dependencies) are installed.
 1. Clone this repository
 2. `npm install` - installs all dependencies
 3. `npm install webgme` - installs webgme (it's a [peer-dependency](https://nodejs.org/en/blog/npm/peer-dependencies/)).
 4. Launch a local mongodb instance (if not local edit the webgme config).
 5. `npm start`
 6. Visit localhost:8888 from a browser.
 
 ## Publish new release at npm
 ```
 npm version 1.0.0 -m "Release %s"
 git push origin master
 git checkout v1.0.0
 git push origin v1.0.0
 npm publish ./
 ```