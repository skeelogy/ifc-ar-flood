//a very basic lambert shader with one point light, just for testing

uniform vec3 uBaseColor;
uniform vec3 uAmbientLightColor;
uniform float uAmbientLightIntensity;
uniform vec3 uPointLight1Pos;
uniform vec3 uPointLight1Color;
uniform float uPointLight1Intensity;
uniform float uPointLight1FalloffStart;
uniform float uPointLight1FalloffEnd;

varying vec3 vPosition;
varying vec3 vNormal;  //assume normalized

void main() {

    vec3 currPosToLightVector = uPointLight1Pos - vPosition;
    float normalModulator = dot(vNormal, normalize(currPosToLightVector));
    float distanceModulator = 1.0 - smoothstep(uPointLight1FalloffStart, uPointLight1FalloffEnd, length(currPosToLightVector));

    vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;
    vec3 diffuse = distanceModulator * normalModulator * uPointLight1Color * uPointLight1Intensity;

    gl_FragColor = vec4(uBaseColor * (ambient + diffuse), 1.0);
}