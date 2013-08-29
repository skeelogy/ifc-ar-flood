//Fragment shader that does basic lambert shading
//author: Skeel Lee <skeel@skeelogy.com>

//assume max 3-point lighting for now
#define MAX_LIGHTS 3

uniform vec3 uBaseColor;
uniform vec3 uAmbientLightColor;
uniform float uAmbientLightIntensity;
uniform vec3 uPointLightWorldPos[MAX_LIGHTS];
uniform vec3 uPointLightColor[MAX_LIGHTS];
uniform float uPointLightIntensity[MAX_LIGHTS];
uniform float uPointLightFalloffStart[MAX_LIGHTS];
uniform float uPointLightFalloffEnd[MAX_LIGHTS];

varying vec3 vViewPos;
varying vec3 vViewNormal;
varying vec2 vUv;

void main() {

    //ambient component
    vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;

    //diffuse component
    vec3 diffuse;
    for (int i = 0; i < MAX_LIGHTS; i++) {
        vec3 viewPosToViewLightVector = (viewMatrix * vec4(uPointLightWorldPos[i], 1.0)).rgb - vViewPos;
        float normalModulator = dot(normalize(vViewNormal), normalize(viewPosToViewLightVector));
        float distanceModulator = 1.0 - smoothstep(uPointLightFalloffStart[i], uPointLightFalloffEnd[i], length(viewPosToViewLightVector));
        diffuse = diffuse + (distanceModulator * normalModulator * uPointLightColor[i] * uPointLightIntensity[i]);
    }

    gl_FragColor = vec4(uBaseColor * (ambient + diffuse), 1.0);
}