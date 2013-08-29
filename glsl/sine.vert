//Vertex shader that distorts a plane with a sine wave
//author: Skeel Lee <skeel@skeelogy.com>

uniform float uTime;
uniform float uFreq;
uniform float uAmp;

varying vec3 vViewPos;
varying vec3 vViewNormal;

void main() {

    float angle = uFreq * (uTime + position.x);

    //find new height
    float y = uAmp * sin(angle);

    //find new normal (analytical normal based on sin curve)
    vViewNormal = normalize(normalMatrix * vec3(-uAmp * cos(angle), 1.0, 0.0));

    //store new pos
    vec4 viewPos = modelViewMatrix * vec4(position.x, y, position.z, 1.0);
    vViewPos = viewPos.rgb;

    gl_Position = projectionMatrix * viewPos;
}