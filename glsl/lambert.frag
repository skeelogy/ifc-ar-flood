//a very basic lambert shader with one point light, just for testing

uniform vec3 baseColor;
uniform vec3 ambientLightColor;
uniform float ambientLightIntensity;
uniform vec3 pointLight1Pos;
uniform vec3 pointLight1Color;
uniform float pointLight1Intensity;
uniform float pointLight1FalloffStart;
uniform float pointLight1FalloffEnd;

varying vec3 vPosition;
varying vec3 vNormal;  //assume normalized

void main() {

    vec3 currPosToLightVector = pointLight1Pos - vPosition;
    float normalModulator = dot(vNormal, normalize(currPosToLightVector));
    float distanceModulator = 1.0 - smoothstep(pointLight1FalloffStart, pointLight1FalloffEnd, length(currPosToLightVector));

    vec3 ambient = ambientLightColor * ambientLightIntensity;
    vec3 diffuse = distanceModulator * normalModulator * pointLight1Color * pointLight1Intensity;

    gl_FragColor = vec4(baseColor * (ambient + diffuse), 1.0);
}