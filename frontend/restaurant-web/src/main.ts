import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initGlobalDoubleClickPrevention } from './app/core/utils/prevent-double-click';

initGlobalDoubleClickPrevention();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
