//basic vertex shader that distorts a plane with a sine wave
//author: Skeel Lee <skeel@skeelogy.com>

uniform float uTime;
uniform float uFreq;
uniform float uAmp;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {

    float angle = uFreq * (uTime + position.x);

    //find new height
    float y = uAmp * sin(angle);

    //find new normal (analytical normal based on sin curve)
    vNormal = normalize(normalMatrix * vec3(-uAmp * cos(angle), 1.0, 0.0));

    //store new pos
    vec4 pos = vec4(position.x, y, position.z, 1.0);
    vWorldPos = (modelMatrix * pos).rgb;

    gl_Position = projectionMatrix * modelViewMatrix * pos;
}