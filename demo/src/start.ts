import {DemoService} from './server';

const service = new DemoService(parseInt(process.env.PORT || '') || 8080);
service.initalize();
