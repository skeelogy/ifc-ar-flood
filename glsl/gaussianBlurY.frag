//Fragment shader gaussian blur (vertical pass)
//author: Skeel Lee <skeel@skeelogy.com>
//Largely obtained from:
//http://www.gamerendering.com/2008/10/11/gaussian-blur-filter-shader/

uniform sampler2D uTexture;
uniform float uTexelSize;

varying vec2 vUv;

void main() {

    vec4 sum = vec4(0.0);

    // blur in y (vertical)
    // take nine samples, with the distance uTexelSize between them
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 4.0 * uTexelSize)) * 0.05;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 3.0 * uTexelSize)) * 0.09;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 2.0 * uTexelSize)) * 0.12;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y - uTexelSize)) * 0.15;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y)) * 0.16;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y + uTexelSize)) * 0.15;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 2.0 * uTexelSize)) * 0.12;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 3.0 * uTexelSize)) * 0.09;
    sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 4.0 * uTexelSize)) * 0.05;

    gl_FragColor = sum;
}