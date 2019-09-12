# Demo service
This is a service which enables demos to be served on webcomponents.org. It
utilizes the unpkg service with support for bare module specifiers.

The client loads demos from the demo service in an iframe. For example, loading
the following URL on webcomponents.org:

https://www.webcomponents.org/element/@polymer/paper-icon-button/demo/demo/index.html

In turn loads the appropriate version of the demo from the demo service, using
a URL like this:

https://npm-demos.appspot.com/@polymer/paper-icon-button@3.0.2/demo/index.html

## Developing
Build this Typescript project:

```bash
npm run build
```

Run the tests:

```bash
npm run test
```

To test client and demo server working together:

Start the demo server on a non-default port.

```bash
PORT=9080; export PORT
npm run start
```

Add an override to the client app (`client/src/catalog-app.html`) to load demos from this URL

```js
if (isLocalhost || this.isProduction()) {
  result.userContent = 'https://raw-dot-custom-elements.appspot.com';
  // result.npmService = 'https://npm-demos.appspot.com';
  result.npmService = 'http://localhost:9080';
} else {
```

Build and run the client service:

```
cd ../client
npm run build
dev_appserver.py build/client.yaml
```

Then _directly_ load a demo link from your local client instance:

[http://localhost:8080/element/@polymer/paper-icon-button/demo/demo/index.html]()

Note that you can't just browse around and click on a demo link: the demo links go directly to 
webcomponents.org.

## Deployment
This project requires [Cloud Firestore in Native mode](https://cloud.google.com/datastore/docs/firestore-or-datastore#choosing_a_database) when running on Google Cloud Platform. Ensure the project is built.

```bash
gcloud app deploy demo.yaml --project <your-project-id>
```
