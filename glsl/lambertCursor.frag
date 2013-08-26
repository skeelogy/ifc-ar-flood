//a very basic lambert shader with one point light, just for testing.
//this is the version that overlays a circular cursor patch.
//author: Skeel Lee <skeel@skeelogy.com>

uniform vec3 uBaseColor;
uniform vec3 uAmbientLightColor;
uniform float uAmbientLightIntensity;
uniform vec3 uPointLight1WorldPos;
uniform vec3 uPointLight1Color;
uniform float uPointLight1Intensity;
uniform float uPointLight1FalloffStart;
uniform float uPointLight1FalloffEnd;

uniform int uShowCursor;
uniform vec2 uCursorPos;
uniform float uCursorRadius;
uniform vec3 uCursorColor;

varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec2 vUv;

void main() {

    vec3 viewPosToViewLightVector = (viewMatrix * vec4(uPointLight1WorldPos, 1.0)).rgb - vViewPos;
    float normalModulator = dot(normalize(vViewNormal), normalize(viewPosToViewLightVector));
    float distanceModulator = 1.0 - smoothstep(uPointLight1FalloffStart, uPointLight1FalloffEnd, length(viewPosToViewLightVector));

    //calculate all components
    vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;
    vec3 diffuse = distanceModulator * normalModulator * uPointLight1Color * uPointLight1Intensity;

    //combine components to get final color
    vec3 finalColor = uBaseColor * (ambient + diffuse);

    //mix in cursor color
    if (uShowCursor == 1) {
        float len = length(vUv - vec2(uCursorPos.x, 1.0 - uCursorPos.y));
        finalColor = mix(finalColor, uCursorColor, smoothstep(uCursorRadius, 0.0, len));
    }

    gl_FragColor = vec4(finalColor, 1.0);
}