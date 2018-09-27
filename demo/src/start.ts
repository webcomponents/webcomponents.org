import {DemoService} from './server';

// Enable Stackdriver Debugging. Reference:
// https://cloud.google.com/debugger/docs/setup/nodejs
if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/debug-agent').start();
}

const service = new DemoService(parseInt(process.env.PORT || '') || 8080);
service.initalize();
