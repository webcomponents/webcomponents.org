import {Temporal} from '@js-temporal/polyfill';
import {PackageInfo} from '@webcomponents/catalog-api/lib/schema.js';
import type Koa from 'koa';
import type {Catalog} from '../../catalog.js';

// Google Cloud Run default request timeout is 5 minutes, so to do longer
// imports we need to configure the timeout.
const maxImportDuration = Temporal.Duration.from({minutes: 5});

export const makeUpdatePackagesRoute =
  (catalog: Catalog) => async (context: Koa.Context) => {
    const startInstant = Temporal.Now.instant();
    // If the `force` query parameter is present we force updating of all
    // packages by setting the `notUpdatedSince` parameter to `startInstant` so
    // that we get all packages last updated before now. We calculate the
    // `notUpdatedSince` time once before updates so that we don't retrieve
    // packages that we update in this operation.
    // `force`` is useful for development and testing as we may be trying to
    // update packages that were just imported.
    // TODO (justinfagnani): check a DEV mode also so this isn't available
    // in production?
    const force = 'force' in context.query;
    const notUpdatedSince = force ? startInstant : undefined;

    // If `force` is true, override the default packageUpdateInterval
    // TODO: how do we make an actually 0 duration?
    const packageUpdateInterval = force
      ? Temporal.Duration.from({microseconds: 1})
      : undefined;

    console.log('Starting package update at', startInstant, `force: ${force}`);

    let packagesToUpdate!: Array<PackageInfo>;
    let packagesUpdated = 0;
    let iteration = 0;

    // Loop through batches of packages to update.
    // We batch here so that we can pause and check that we're still within the
    // maxImportDuration, and use small enough batches so that we can ensure at
    // least one batch in that time.
    do {
      // getPackagesToUpdate() queries the first N (default 100) packages that
      // have not been updated since the update interval (default 6 hours).
      // When a package is imported it's lastUpdate date will be updated and the
      // next call to getPackagesToUpdate() will return the next 100 packages.
      // This way we don't need a DB cursor to make progress through the
      // package list.
      packagesToUpdate = await catalog.getPackagesToUpdate(notUpdatedSince);

      if (packagesToUpdate.length === 0) {
        // No more packages to update
        if (iteration === 0) {
          console.log('No packages to update');
        }
        break;
      }

      await Promise.allSettled(
        packagesToUpdate.map(async (pkg) => {
          try {
            return await catalog.importPackage(pkg.name, packageUpdateInterval);
          } catch (e) {
            console.error(e);
            throw e;
          }
        })
      );
      packagesUpdated += packagesToUpdate.length;

      const now = Temporal.Now.instant();
      const timeSinceStart = now.since(startInstant);
      // If the time since the update started is not less than that max import
      // duration, stop.
      // TODO (justinfagnani): we need a way to test this
      if (Temporal.Duration.compare(timeSinceStart, maxImportDuration) !== -1) {
        break;
      }
    } while (true);
    console.log(`Updated ${packagesUpdated} packages`);

    if (packagesToUpdate.length > 0) {
      // TODO (justinfagnani): kick off new update request
      console.log(`Not all packages were updated (${packagesToUpdate.length})`);
    }

    context.status = 200;
    context.type = 'html';
    context.body = `
      <h1>Update Results</h1>
      <p>Updated ${packagesUpdated} package</p>
    `;
  };
