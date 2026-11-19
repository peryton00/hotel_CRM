import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RouteLoadingBarComponent } from './shared/components/loading/route-loading-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouteLoadingBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('GuruKripa Dhaba');
}
