
export type Ref<TValue> = {
	val: TValue
};

export type OutRef<TValue> = {
	val?: TValue
};

export function setRefIfNone<TValue>(
	ref: OutRef<TValue> | undefined,
	onNone: () => TValue,
	nullIsNone: boolean = true
): Ref<TValue> {
	if(ref == null) {
		return {val:onNone()};
	}
	if(nullIsNone ? (ref.val == null) : (ref.val === undefined)) {
		return {val:onNone()};
	}
	return ref as Ref<TValue>;
}
