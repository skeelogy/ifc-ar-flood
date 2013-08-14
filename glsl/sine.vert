//basic vertex shader that distorts a plane with a sine wave

uniform float time;
uniform float freq;
uniform float amp;

varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    float angle = freq * (time + position.x);
    float y = amp * sin(angle);
    vNormal = normalize(normalMatrix * vec3(-amp * cos(angle), 1.0, 0.0));  //analytical normal based on sin curve
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, y, position.z, 1.0);
}