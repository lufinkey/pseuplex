# Example Plugin

An example plugin for the [Pseudo Metadata Proxy for Plex](https://github.com/lufinkey/pseuplex). This plugin prepends the text `Hello World - ` to all hub titles on the homepage. It is intended to provide a starting point for writing your own plugin.

## Developing

To develop on this plugin, you'll first need to clone and build the proxy repo for the version you want to develop on:

```shell
# enter the folder where you store your projects
cd ~/Code
# clone the proxy repo on the version you want to develop for
git clone https://github.com/lufinkey/pseuplex --branch v0.2.2
# enter the proxy repo folder
cd pseuplex
# install dependencies
npm install && npm run build
```

Then you'll need to link your plugin repo to the proxy repo:

```shell
# enter your plugin repo
cd ../pseuplex-plugin-helloworld
# link the proxy's package to your plugin (this is only for development purposes)
npm link pseuplex@file:../pseuplex
```

Now you can install any additional dependencies needed to develop on your plugin:

```shell
# install dependencies for your plugin
npm install
```
