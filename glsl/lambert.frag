//a very basic lambert shader with one point light, just for testing
//author: Skeel Lee <skeel@skeelogy.com>

uniform vec3 uBaseColor;
uniform vec3 uAmbientLightColor;
uniform float uAmbientLightIntensity;
uniform vec3 uPointLight1WorldPos;
uniform vec3 uPointLight1Color;
uniform float uPointLight1Intensity;
uniform float uPointLight1FalloffStart;
uniform float uPointLight1FalloffEnd;

varying vec3 vViewPos;
varying vec3 vViewNormal;

void main() {

    vec3 viewPosToViewLightVector = (viewMatrix * vec4(uPointLight1WorldPos, 1.0)).rgb - vViewPos;
    float normalModulator = dot(normalize(vViewNormal), normalize(viewPosToViewLightVector));
    float distanceModulator = 1.0 - smoothstep(uPointLight1FalloffStart, uPointLight1FalloffEnd, length(viewPosToViewLightVector));

    vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;
    vec3 diffuse = distanceModulator * normalModulator * uPointLight1Color * uPointLight1Intensity;

    gl_FragColor = vec4(uBaseColor * (ambient + diffuse), 1.0);
}