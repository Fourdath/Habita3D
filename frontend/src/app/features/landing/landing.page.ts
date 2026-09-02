import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton
} from '@ionic/angular';

import {
  inspectCubiCasaSvg,
  extractCubiCasaWalls
} from '../../core/floorplan/cubicasa-parser';

@Component({
  selector: 'app-landing',
  templateUrl: 'landing.page.html',
  styleUrls: ['landing.page.scss'],
  imports: [
    IonContent,
    IonButton,
    RouterLink
  ],
})
export class LandingPage implements OnInit {

  constructor() {}
  async ngOnInit() {
  try {
    const response = await fetch('/assets/floorplans/model.svg');

    const svgText = await response.text();

    const result = inspectCubiCasaSvg(svgText);

    console.log('Resultado CubiCasa:', result);

    const walls = extractCubiCasaWalls(svgText);

    console.log('Muros extraídos:', walls.length);
    console.log('Primer muro:', walls[0]);
  } catch (error) {
    console.error('No se pudo inspeccionar el plano CubiCasa:', error);
  }
}


}