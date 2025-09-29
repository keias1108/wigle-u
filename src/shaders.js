export function getLifecycleShader(size) {
  return `
                uniform sampler2D field;
                uniform float innerRadius;
                uniform float innerStrength;
                uniform float outerRadius;
                uniform float outerStrength;
                uniform float growthCenter;
                uniform float growthWidth;
                uniform float growthRate;
                uniform float suppressionFactor;
                uniform float globalAverage;
                uniform float decayRate;
                uniform float diffusionRate;
                uniform float fissionThreshold;
                uniform float instabilityFactor;
                uniform sampler2D interactionTexture;
                uniform vec2 texelSize;
                
                float kernelWeight(float dist) {
                    float weight = 0.0;
                    
                    if (dist < innerRadius) {
                        float t = 1.0 - (dist / innerRadius);
                        weight += innerStrength * t * t;
                    }
                    
                    float ringStart = innerRadius + 1.0;
                    float ringEnd = outerRadius;
                    if (dist > ringStart && dist < ringEnd) {
                        float t = (dist - ringStart) / (ringEnd - ringStart);
                        weight += outerStrength * exp(-2.0 * t * t);
                    }
                    
                    return weight;
                }
                
                float growthFunction(float potential, float currentEnergy) {
                    float x = (potential - growthCenter) / growthWidth;
                    float bellCurve = exp(-x * x * 0.5);
                    
                    if (currentEnergy > fissionThreshold) {
                        float excess = (currentEnergy - fissionThreshold) / (1.0 - fissionThreshold);
                        bellCurve -= excess * instabilityFactor;
                    }
                    
                    return bellCurve;
                }
                
                float laplacian(vec2 uv) {
                    float sum = 0.0;
                    sum += texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).x;
                    sum += texture2D(field, uv + vec2(1.0, 0.0) * texelSize).x;
                    sum += texture2D(field, uv + vec2(0.0, -1.0) * texelSize).x;
                    sum += texture2D(field, uv + vec2(0.0, 1.0) * texelSize).x;
                    sum -= 4.0 * texture2D(field, uv).x;
                    return sum;
                }
                
                float random(vec2 co) {
                    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                void main() {
                    vec2 uv = gl_FragCoord.xy * texelSize;
                    
                    float currentEnergy = texture2D(field, uv).x;
                    vec3 interaction = texture2D(interactionTexture, uv).rgb;
                    
                    float potential = 0.0;
                    float totalWeight = 0.0;
                    
                    int kernelSize = 10;
                    for (int dy = -kernelSize; dy <= kernelSize; dy++) {
                        for (int dx = -kernelSize; dx <= kernelSize; dx++) {
                            vec2 offset = vec2(float(dx), float(dy));
                            float dist = length(offset);
                            
                            if (dist <= outerRadius) {
                                vec2 neighborUV = fract(uv + offset * texelSize);
                                float neighborEnergy = texture2D(field, neighborUV).x;
                                float weight = kernelWeight(dist);
                                
                                weight += interaction.g * 2.0 - interaction.b * 2.0;
                                
                                potential += neighborEnergy * weight;
                                totalWeight += abs(weight);
                            }
                        }
                    }
                    
                    if (totalWeight > 0.0) {
                        potential /= totalWeight;
                    }
                    
                    float growth = growthFunction(potential, currentEnergy) - 0.5;
                    growth -= globalAverage * suppressionFactor;
                    
                    float metabolism = currentEnergy * currentEnergy * decayRate;
                    float diffusion = laplacian(uv) * diffusionRate;
                    
                    float fissionNoise = 0.0;
                    if (currentEnergy > fissionThreshold) {
                        float excess = (currentEnergy - fissionThreshold) / (1.0 - fissionThreshold);
                        float chaos = sin(dot(uv * 100.0 + currentEnergy * 50.0, vec2(12.9898, 78.233)));
                        fissionNoise = chaos * excess * 0.1;
                    }
                    
                    float interactionEnergy = interaction.r * 0.1;
                    
                    float deltaEnergy = growthRate * growth - metabolism + diffusion + fissionNoise + interactionEnergy;
                    float newEnergy = currentEnergy + deltaEnergy;
                    
                    float noise = (random(uv + currentEnergy) - 0.5) * 0.001;
                    newEnergy += noise;
                    
                    newEnergy = clamp(newEnergy, 0.0, 1.0);
                    
                    gl_FragColor = vec4(newEnergy, 0.0, 0.0, 1.0);
                }
            `;
}
