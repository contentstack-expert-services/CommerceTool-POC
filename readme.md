
# Commerce Tool POC

This script replaces the Category and Product IDs of the two configs of the commerce tool app. This can be used when migrating the data from one stack to another.


## How to run 

* **Clone the project**

```bash
git clone https://github.com/contentstack-expert-services/CommerceTool-POC.git
```
* **Install the dependencies**

```bash
  cd my-project
  npm install
```
* **Enter you CommerceTool config credentials

```bash
1) Go to the dest.config.js file in your project and enter the following details

    projectKey : 'Your Project Key',
    clientId : 'Your Client ID',
    clientSecret : 'Your Client Secret',
    authUrl : 'Your Auth URL',
    apiUrl : 'Your API URL',
    ExportedDataPath : 'Your Exported Data Path'

```

* **Run index.js**

```bash
  node index.js
```

**This will start the script and the categories, products with valid key will get replaced.
This script will stop the publishing of the entries with empty category and product object** 