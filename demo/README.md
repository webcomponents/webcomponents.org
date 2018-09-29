# Demo service
This is a service which enables demos to be served on webcomponents.org. It
utilizes the unpkg service with support for bare module specifiers.

## Developing
Build this Typescript project:

```
npm run build
```

Run the tests:
```
npm run test
```

## Deployment
This project requires [Cloud Firestore in Native mode](https://cloud.google.com/datastore/docs/firestore-or-datastore#choosing_a_database) when running on Google Cloud Platform. Ensure the project is built.
```
gcloud app deploy demo.yaml --project <your-project-id>
