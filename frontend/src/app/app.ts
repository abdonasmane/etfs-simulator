import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root application component.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [],
})
export class App {}
